import React, { useState } from 'react'
import { signUp, signIn, createFamily, joinFamily } from '../supabase.js'

const Login = ({ onFamilyCreated }) => {
  const [mode, setMode] = useState('signin') // 'signin', 'signup', 'create-family', 'join-family'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [familyName, setFamilyName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSignIn = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await signIn(email, password)
    if (error) {
      setError(error.message)
    }
    setLoading(false)
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await signUp(email, password)
    if (error) {
      setError(error.message)
    } else {
      setMode('create-family')
    }
    setLoading(false)
  }

  const handleCreateFamily = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await createFamily(familyName, name)
    if (error) {
      setError(error.message)
    } else {
      onFamilyCreated()
    }
    setLoading(false)
  }

  const handleJoinFamily = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await joinFamily(inviteCode, name)
    if (error) {
      setError(error.message)
    } else {
      onFamilyCreated()
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">🏠</div>
            <h1 className="text-3xl font-bold text-gray-900">Family Hub</h1>
            <p className="text-gray-600 mt-2">Organize your family life</p>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {/* Sign In Form */}
          {mode === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your email"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your password"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Signing In...' : 'Sign In'}
              </button>
              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className="text-blue-600 hover:text-blue-800"
                >
                  Don't have an account? Sign up
                </button>
              </div>
            </form>
          )}

          {/* Sign Up Form */}
          {mode === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your email"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Create a password (min 6 characters)"
                  required
                  minLength={6}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? 'Creating Account...' : 'Create Account'}
              </button>
              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => setMode('signin')}
                  className="text-blue-600 hover:text-blue-800"
                >
                  Already have an account? Sign in
                </button>
              </div>
            </form>
          )}

          {/* Create Family Form */}
          {mode === 'create-family' && (
            <div>
              <h2 className="text-xl font-semibold mb-4 text-center">Create Your Family</h2>
              <form onSubmit={handleCreateFamily} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Your Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter your name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Family Name</label>
                  <input
                    type="text"
                    value={familyName}
                    onChange={(e) => setFamilyName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., The Smith Family"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 disabled:opacity-50"
                >
                  {loading ? 'Creating Family...' : 'Create Family'}
                </button>
                <div className="text-center mt-4">
                  <button
                    type="button"
                    onClick={() => setMode('join-family')}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    Want to join an existing family instead?
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Join Family Form */}
          {mode === 'join-family' && (
            <div>
              <h2 className="text-xl font-semibold mb-4 text-center">Join a Family</h2>
              <form onSubmit={handleJoinFamily} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Your Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter your name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Family Invite Code</label>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter the family invite code"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? 'Joining Family...' : 'Join Family'}
                </button>
                <div className="text-center mt-4">
                  <button
                    type="button"
                    onClick={() => setMode('create-family')}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    Want to create a new family instead?
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Login
