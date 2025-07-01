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

// Google Calendar Integration Functions
// Add these to your src/supabase.js file

// Note: These require setting up Google Calendar API credentials
// You'll need to create a project in Google Cloud Console and enable Calendar API

export const initiateGoogleCalendarSync = async (familyId) => {
  try {
    // This would redirect to Google OAuth
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${import.meta.env.VITE_GOOGLE_CLIENT_ID}&` +
      `redirect_uri=${window.location.origin}/auth/google&` +
      `response_type=code&` +
      `scope=https://www.googleapis.com/auth/calendar.readonly&` +
      `state=${familyId}`
    
    window.location.href = googleAuthUrl
  } catch (error) {
    console.error('Error initiating Google Calendar sync:', error)
    throw error
  }
}

export const syncGoogleCalendarEvents = async (familyId, accessToken) => {
  try {
    // Fetch events from Google Calendar
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${new Date().toISOString()}&` +
      `maxResults=50&` +
      `singleEvents=true&` +
      `orderBy=startTime`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      throw new Error('Failed to fetch Google Calendar events')
    }

    const data = await response.json()
    const events = data.items || []

    // Convert Google Calendar events to our format
    const familyHubEvents = events.map(event => ({
      family_id: familyId,
      title: event.summary || 'No Title',
      event_date: event.start.date || event.start.dateTime?.split('T')[0],
      event_time: event.start.dateTime ? 
        new Date(event.start.dateTime).toTimeString().slice(0, 5) : null,
      end_date: event.end.date || event.end.dateTime?.split('T')[0],
      end_time: event.end.dateTime ? 
        new Date(event.end.dateTime).toTimeString().slice(0, 5) : null,
      description: event.description || '',
      location: event.location || '',
      all_day: !!event.start.date, // Google uses 'date' for all-day events
      color: '#4285f4', // Google blue
      external_id: event.id,
      external_source: 'google',
      sync_status: 'synced'
    }))

    // Insert or update events in our database
    const { data: insertedEvents, error } = await supabase
      .from('calendar_events')
      .upsert(
        familyHubEvents,
        { 
          onConflict: 'external_id,family_id',
          ignoreDuplicates: false 
        }
      )
      .select()

    if (error) throw error

    // Update sync settings
    await supabase
      .from('calendar_sync_settings')
      .update({ 
        last_sync_at: new Date().toISOString(),
        google_calendar_enabled: true 
      })
      .eq('family_id', familyId)

    return { success: true, eventCount: familyHubEvents.length }

  } catch (error) {
    console.error('Error syncing Google Calendar events:', error)
    throw error
  }
}

// Apple Calendar integration (CalDAV)
export const syncAppleCalendarEvents = async (familyId, username, password) => {
  try {
    // This would require CalDAV integration
    // Apple Calendar uses CalDAV protocol for syncing
    
    const calDAVUrl = `https://caldav.icloud.com/${username}/calendars/`
    
    // Note: This is a simplified example
    // Real implementation would need proper CalDAV library
    
    console.log('Apple Calendar sync would be implemented here')
    alert('Apple Calendar sync requires CalDAV implementation')
    
    return { success: false, message: 'Not implemented yet' }
    
  } catch (error) {
    console.error('Error syncing Apple Calendar:', error)
    throw error
  }
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
