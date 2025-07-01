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

// Family helper functions (updated to handle new return format)
export const createFamily = async (familyName, memberName) => {
  try {
    const { data, error } = await supabase.rpc('create_family_and_member', {
      family_name: familyName,
      member_name: memberName
    })
    
    if (error) {
      console.error('Supabase RPC error:', error)
      return { data: null, error }
    }
    
    console.log('Create family response:', data)
    return { data, error: null }
  } catch (err) {
    console.error('Create family catch error:', err)
    return { data: null, error: err }
  }
}

export const joinFamily = async (inviteCode, memberName) => {
  try {
    const { data, error } = await supabase.rpc('join_family_by_code', {
      invite_code: inviteCode,
      member_name: memberName
    })
    
    if (error) {
      console.error('Supabase RPC error:', error)
      return { data: null, error }
    }
    
    if (data && !data.success) {
      return { data: null, error: { message: data.error } }
    }
    
    console.log('Join family response:', data)
    return { data, error: null }
  } catch (err) {
    console.error('Join family catch error:', err)
    return { data: null, error: err }
  }
}
