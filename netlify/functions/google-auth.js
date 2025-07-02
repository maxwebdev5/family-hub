// netlify/functions/google-auth.js
// This function handles the secure token exchange and refresh with Google

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  }

  // Handle CORS preflight request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    }
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
    
    let tokenRequestBody
    
    if (requestBody.grant_type === 'refresh_token') {
      // Handle token refresh
      const { refresh_token } = requestBody
      
      if (!refresh_token) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Refresh token is required' })
        }
      }

      tokenRequestBody = new URLSearchParams({
        client_id: process.env.VITE_GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: refresh_token,
        grant_type: 'refresh_token'
      })
    } else {
      // Handle initial token exchange
      const { code, redirectUri } = requestBody

      if (!code) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Authorization code is required' })
        }
      }

      tokenRequestBody = new URLSearchParams({
        client_id: process.env.VITE_GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    }

    // Exchange code for tokens or refresh token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenRequestBody
    })

    const tokenData = await tokenResponse.json()

    if (!tokenResponse.ok) {
      console.error('Google token request failed:', tokenData)
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Token request failed', 
          details: tokenData.error_description || tokenData.error 
        })
      }
    }

    // Return tokens to frontend
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
      body: JSON.stringify({ error: 'Internal server error', details: error.message })
    }
  }
}
