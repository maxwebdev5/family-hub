import { createClient } from '@supabase/supabase-js'

// These will be set as environment variables in Netlify
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL_HERE'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY_HERE'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Auth helper functions
export const signUp = async (email, password) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  })
  return { data, error }
}

export const signIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  return { data, error }
}

export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export const getCurrentUser = () => {
  return supabase.auth.getUser()
}

// Get user's family data
export const getUserFamily = async () => {
  try {
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      console.error('No authenticated user found:', userError)
      return { data: null, error: userError || new Error('No user found') }
    }

    console.log('Current user ID:', user.id)

    // Get the family member record for this user
    const { data, error } = await supabase
      .from('family_members')
      .select(`
        id,
        name,
        role,
        family_id,
        user_id,
        families!inner(
          id,
          name,
          invite_code
        )
      `)
      .eq('user_id', user.id)
      .single()

    if (error) {
      console.error('Error fetching family:', error)
      return { data: null, error }
    }

    console.log('User family data:', data)
    return { data, error: null }
  } catch (err) {
    console.error('getUserFamily catch error:', err)
    return { data: null, error: err }
  }
}

// Create a new family and add user as admin
export const createFamily = async (familyName, memberName) => {
  try {
    console.log('Creating family:', { familyName, memberName })
    
    const { data, error } = await supabase.rpc('create_family_and_member', {
      family_name: familyName,
      member_name: memberName
    })
    
    if (error) {
      console.error('Supabase RPC error:', error)
      return { data: null, error }
    }
    
    console.log('Create family RPC response:', data)
    
    // After successful creation, fetch the complete family data
    if (data && data.success) {
      // Small delay to ensure data is committed
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const familyData = await getUserFamily()
      console.log('Family data after creation:', familyData)
      
      return familyData
    }
    
    return { data, error: null }
  } catch (err) {
    console.error('Create family catch error:', err)
    return { data: null, error: err }
  }
}

// Join an existing family using invite code
export const joinFamily = async (inviteCode, memberName) => {
  try {
    console.log('Joining family:', { inviteCode, memberName })
    
    const { data, error } = await supabase.rpc('join_family_by_code', {
      invite_code: inviteCode,
      member_name: memberName
    })
    
    if (error) {
      console.error('Supabase RPC error:', error)
      return { data: null, error }
    }
    
    console.log('Join family RPC response:', data)
    
    if (data && !data.success) {
      return { data: null, error: { message: data.error } }
    }
    
    // After successful join, fetch the complete family data
    if (data && data.success) {
      // Small delay to ensure data is committed
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const familyData = await getUserFamily()
      console.log('Family data after joining:', familyData)
      
      return familyData
    }
    
    return { data, error: null }
  } catch (err) {
    console.error('Join family catch error:', err)
    return { data: null, error: err }
  }
}

// ============================================================================
// GOOGLE CALENDAR INTEGRATION FUNCTIONS
// ============================================================================

export const initiateGoogleCalendarAuth = () => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  
  if (!clientId) {
    throw new Error('Google Client ID not configured. Please add VITE_GOOGLE_CLIENT_ID to environment variables.')
  }
  
  const redirectUri = `${window.location.origin}/auth/google`
  const scope = 'https://www.googleapis.com/auth/calendar.readonly'
  
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${clientId}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(scope)}&` +
    `access_type=offline&` +
    `prompt=consent`
    
  console.log('Redirecting to Google OAuth:', authUrl)
  window.location.href = authUrl
}

// Replace the handleGoogleAuthCallback function in src/supabase.js with this:

export const handleGoogleAuthCallback = async (code, familyId) => {
  try {
    console.log('Handling Google auth callback with code:', code)
    
    const redirectUri = `${window.location.origin}/auth/google`
    
    // Use our Netlify function for secure token exchange
    const tokenResponse = await fetch('/.netlify/functions/google-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: code,
        redirectUri: redirectUri
      })
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      console.error('Token exchange failed:', errorData)
      throw new Error(`Failed to exchange code for token: ${errorData.error} - ${errorData.details || ''}`)
    }

    const tokens = await tokenResponse.json()
    console.log('Received tokens from Google via Netlify function')
    
    // Store tokens in calendar sync settings
    const { error } = await supabase
      .from('calendar_sync_settings')
      .update({
        google_calendar_enabled: true,
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token || null,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('family_id', familyId)

    if (error) {
      console.error('Error saving tokens:', error)
      throw error
    }

    return { success: true, tokens }
  } catch (error) {
    console.error('Error handling Google auth callback:', error)
    throw error
  }
}

export const syncGoogleCalendarEvents = async (familyId) => {
  try {
    console.log('Starting Google Calendar sync for family:', familyId)
    
    // Get stored access token
    const { data: syncSettings, error: settingsError } = await supabase
      .from('calendar_sync_settings')
      .select('*')
      .eq('family_id', familyId)
      .single()

    if (settingsError) {
      console.error('Error fetching sync settings:', settingsError)
      throw new Error('Could not fetch sync settings')
    }

    if (!syncSettings?.google_access_token) {
      throw new Error('No Google Calendar access token found. Please reconnect your Google Calendar.')
    }

    console.log('Found access token, fetching Google Calendar events...')

    // Fetch events from Google Calendar
    const now = new Date()
    const oneMonthFromNow = new Date()
    oneMonthFromNow.setMonth(now.getMonth() + 1)

    const eventsResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${now.toISOString()}&` +
      `timeMax=${oneMonthFromNow.toISOString()}&` +
      `maxResults=50&` +
      `singleEvents=true&` +
      `orderBy=startTime`,
      {
        headers: {
          'Authorization': `Bearer ${syncSettings.google_access_token}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (eventsResponse.status === 401) {
      console.log('Access token expired, attempting to refresh...')
      // Token expired, try to refresh
      if (syncSettings.google_refresh_token) {
        const refreshed = await refreshGoogleToken(familyId, syncSettings.google_refresh_token)
        if (refreshed) {
          console.log('Token refreshed, retrying sync...')
          // Retry with new token
          return syncGoogleCalendarEvents(familyId)
        }
      }
      throw new Error('Google Calendar access expired. Please reconnect your account.')
    }

    if (!eventsResponse.ok) {
      const errorText = await eventsResponse.text()
      console.error('Google Calendar API error:', errorText)
      throw new Error(`Google Calendar API error: ${eventsResponse.status}`)
    }

    const data = await eventsResponse.json()
    const events = data.items || []
    
    console.log(`Found ${events.length} events from Google Calendar`)

    // Convert Google Calendar events to our format
    const familyHubEvents = events.map(event => {
      // Handle different date/time formats from Google
      let eventDate, eventTime, endDate, endTime, allDay
      
      if (event.start.date) {
        // All-day event
        eventDate = event.start.date
        endDate = event.end.date
        eventTime = null
        endTime = null
        allDay = true
      } else if (event.start.dateTime) {
        // Timed event
        const startDateTime = new Date(event.start.dateTime)
        const endDateTime = new Date(event.end.dateTime)
        
        eventDate = startDateTime.toISOString().split('T')[0]
        eventTime = startDateTime.toTimeString().slice(0, 5)
        endDate = endDateTime.toISOString().split('T')[0]
        endTime = endDateTime.toTimeString().slice(0, 5)
        allDay = false
      }

      return {
        family_id: familyId,
        title: event.summary || 'Untitled Event',
        event_date: eventDate,
        event_time: eventTime,
        end_date: endDate,
        end_time: endTime,
        description: event.description || '',
        location: event.location || '',
        all_day: allDay,
        color: '#4285f4', // Google blue
        external_id: event.id,
        external_source: 'google',
        sync_status: 'synced'
      }
    }).filter(event => event.event_date) // Filter out events without valid dates

    console.log(`Converted ${familyHubEvents.length} events to Family Hub format`)

    // Insert or update events in our database
    let insertedCount = 0
    for (const event of familyHubEvents) {
      try {
        const { error } = await supabase
          .from('calendar_events')
          .upsert(event, { 
            onConflict: 'external_id,family_id',
            ignoreDuplicates: false 
          })

        if (!error) {
          insertedCount++
        } else {
          console.error('Error upserting event:', error, event)
        }
      } catch (eventError) {
        console.error('Error processing event:', eventError, event)
      }
    }

    // Update sync timestamp
    await supabase
      .from('calendar_sync_settings')
      .update({ 
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('family_id', familyId)

    console.log(`Successfully synced ${insertedCount} events`)

    return { 
      success: true, 
      eventCount: insertedCount,
      totalFound: events.length,
      message: `Successfully synced ${insertedCount} events from Google Calendar`
    }

  } catch (error) {
    console.error('Error syncing Google Calendar events:', error)
    throw error
  }
}

const refreshGoogleToken = async (familyId, refreshToken) => {
  try {
    console.log('Attempting to refresh Google token...')
    
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    })

    if (!response.ok) {
      console.error('Token refresh failed:', response.status)
      return false
    }

    const tokens = await response.json()
    console.log('Token refreshed successfully')
    
    // Update the access token (and refresh token if provided)
    const updateData = {
      google_access_token: tokens.access_token,
      updated_at: new Date().toISOString()
    }
    
    if (tokens.refresh_token) {
      updateData.google_refresh_token = tokens.refresh_token
    }

    await supabase
      .from('calendar_sync_settings')
      .update(updateData)
      .eq('family_id', familyId)

    return true
  } catch (error) {
    console.error('Error refreshing Google token:', error)
    return false
  }
}

// Disconnect Google Calendar
export const disconnectGoogleCalendar = async (familyId) => {
  try {
    // Clear Google Calendar tokens and settings
    const { error } = await supabase
      .from('calendar_sync_settings')
      .update({
        google_calendar_enabled: false,
        google_access_token: null,
        google_refresh_token: null,
        updated_at: new Date().toISOString()
      })
      .eq('family_id', familyId)

    if (error) throw error

    // Optionally remove Google Calendar events
    await supabase
      .from('calendar_events')
      .delete()
      .eq('family_id', familyId)
      .eq('external_source', 'google')

    return { success: true }
  } catch (error) {
    console.error('Error disconnecting Google Calendar:', error)
    throw error
  }
}

// Check if Google Calendar is connected
export const isGoogleCalendarConnected = async (familyId) => {
  try {
    const { data, error } = await supabase
      .from('calendar_sync_settings')
      .select('google_calendar_enabled, google_access_token, last_sync_at')
      .eq('family_id', familyId)
      .single()

    if (error) return false

    return !!(data?.google_calendar_enabled && data?.google_access_token)
  } catch (error) {
    console.error('Error checking Google Calendar connection:', error)
    return false
  }
}
