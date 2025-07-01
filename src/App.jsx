import React, { useState, useEffect } from 'react'
import { supabase, signOut, getUserFamily } from './supabase.js'
import Login from './components/Login.jsx'
import Dashboard from './components/Dashboard.jsx'
import Chores from './components/Chores.jsx'
import MealPlan from './components/MealPlan.jsx'
import EnhancedCalendar from './components/EnhancedCalendar.jsx'
import FamilySettings from './components/FamilySettings.jsx'

function App() {
  const [user, setUser] = useState(null)
  const [family, setFamily] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('dashboard')

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadUserFamily()
      } else {
        setLoading(false)
      }
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadUserFamily()
      } else {
        setFamily(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const loadUserFamily = async () => {
    try {
      const { data, error } = await getUserFamily()
      if (error) {
        console.error('Error loading family:', error)
      } else {
        setFamily(data)
      }
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    const { error } = await signOut()
    if (error) {
      console.error('Error signing out:', error)
    }
  }

  const handleFamilyCreated = () => {
    loadUserFamily()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🏠</div>
          <div className="text-xl font-semibold text-gray-700">Loading Family Hub...</div>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Login onFamilyCreated={handleFamilyCreated} />
  }

  if (!family) {
    return <Login onFamilyCreated={handleFamilyCreated} />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900">🏠 {family.families.name}</h1>
              <div className="text-sm text-gray-600">
                Welcome, {family.name}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-600">
                Invite Code: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{family.families.invite_code}</span>
              </div>
              <button
                onClick={handleSignOut}
                className="bg-red-100 text-red-700 px-3 py-1 rounded-lg text-sm hover:bg-red-200"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8 overflow-x-auto">
            {[
              { id: 'dashboard', label: '📊 Dashboard' },
              { id: 'chores', label: '✅ Chores' },
              { id: 'meals', label: '🍽️ Meal Plan' },
              { id: 'calendar', label: '📅 Calendar' },
              { id: 'settings', label: '⚙️ Settings' }
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`py-4 px-2 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                  activeTab === id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && <Dashboard family={family} />}
        {activeTab === 'chores' && <Chores family={family} />}
        {activeTab === 'meals' && <MealPlan family={family} />}
        {activeTab === 'calendar' && <EnhancedCalendar family={family} />}
        {activeTab === 'settings' && <FamilySettings family={family} />}
      </main>
    </div>
  )
}

export default App
