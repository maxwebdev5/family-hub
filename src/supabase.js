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
