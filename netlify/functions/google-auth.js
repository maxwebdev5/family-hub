exports.handler = async (event, context) => {
  console.log('Function called with method:', event.httpMethod)
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  try {
    const requestBody = JSON.parse(event.body)
    console.log('Request received:', { 
      hasCode: !!requestBody.code,
      redirectUri: requestBody.redirectUri,
      grantType: requestBody.grant_type 
    })
    
    // Check environment variables
    if (!process.env.VITE_GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.error('Missing environment variables')
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Server configuration error',
          details: 'Missing Google OAuth credentials'
        })
      }
    }
    
    let tokenRequestBody
    
    if (requestBody.grant_type === 'refresh_token') {
      // Handle token refresh
      if (!requestBody.refresh_token) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Refresh token is required' })
        }
      }

      tokenRequestBody = new URLSearchParams({
        client_id: process.env.VITE_GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: requestBody.refresh_token,
        grant_type: 'refresh_token'
      })
    } else {
      // Handle initial token exchange
      if (!requestBody.code) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Authorization code is required' })
        }
      }

      // Fix: Use the same redirect URI format
      const redirectUri = requestBody.redirectUri || new URL(event.headers.referer || event.headers.origin).origin

      tokenRequestBody = new URLSearchParams({
        client_id: process.env.VITE_GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code: requestBody.code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    }

    console.log('Making request to Google with redirect_uri:', 
      tokenRequestBody.get('redirect_uri'))

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenRequestBody
    })

    const tokenData = await tokenResponse.json()
    console.log('Google response status:', tokenResponse.status)

    if (!tokenResponse.ok) {
      console.error('Google token request failed:', tokenData)
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Token request failed', 
          details: tokenData.error_description || tokenData.error,
          googleError: tokenData
        })
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        token_type: tokenData.token_type
      })
    }

  } catch (error) {
    console.error('Function error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      })
    }
  }
}
