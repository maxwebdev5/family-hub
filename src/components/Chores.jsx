import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase.js'

const Chores = ({ family }) => {
  const [chores, setChores] = useState([])
  const [familyMembers, setFamilyMembers] = useState([])
  const [showChoreModal, setShowChoreModal] = useState(false)
  const [editingChore, setEditingChore] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('active') // 'active' or 'completed'
  const [choreForm, setChoreForm] = useState({
    name: '',
    assigned_to: '',
    due_date: '',
    type: 'one-time',
    recurring_frequency: 'daily',
    recurring_days: []
  })

  const timezones = [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Europe/Paris',
    'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney'
  ]

  useEffect(() => {
    if (family) {
      loadChores()
      loadFamilyMembers()
      // Set up auto-reset interval (check every hour)
      const interval = setInterval(checkAndResetChores, 60 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [family])

  const loadChores = async () => {
    try {
      const { data, error } = await supabase
        .from('chores')
        .select(`
          *,
          family_members!assigned_to(id, name)
        `)
        .eq('family_id', family.family_id)
        .order('completed', { ascending: true })
        .order('created_at', { ascending: false })

      if (error) throw error
      setChores(data || [])
    } catch (error) {
      console.error('Error loading chores:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadFamilyMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('family_members')
        .select('*')
        .eq('family_id', family.family_id)

      if (error) throw error
      setFamilyMembers(data || [])
    } catch (error) {
      console.error('Error loading family members:', error)
    }
  }

  const checkAndResetChores = async () => {
    try {
      // Call the database function to handle reset logic
      const { data, error } = await supabase.rpc('reset_recurring_chores', {
        target_family_id: family.family_id
      })

      if (error) throw error

      if (data > 0) {
        console.log(`Reset ${data} chores`)
        // Reload chores to reflect changes
        loadChores()
      }
    } catch (error) {
      console.error('Error in auto-reset:', error)
    }
  }

  const toggleChoreComplete = async (choreId, completed) => {
    try {
      const completedAt = !completed ? new Date().toISOString() : null
      
      // Immediately update local state for instant feedback
      setChores(chores.map(chore => 
        chore.id === choreId ? { 
          ...chore, 
          completed: !completed, 
          completed_at: completedAt 
        } : chore
      ))

      // Update database
      const { error } = await supabase
        .from('chores')
        .update({ 
          completed: !completed,
          completed_at: completedAt,
          updated_at: new Date().toISOString() 
        })
        .eq('id', choreId)

      if (error) {
        // If database update fails, revert the local state
        setChores(chores.map(chore => 
          chore.id === choreId ? { 
            ...chore, 
            completed: completed, 
            completed_at: chore.completed_at 
          } : chore
        ))
        console.error('Error updating chore:', error)
      }
    } catch (error) {
      console.error('Error updating chore:', error)
      // Revert local state on error
      setChores(chores.map(chore => 
        chore.id === choreId ? { 
          ...chore, 
          completed: completed, 
          completed_at: chore.completed_at 
        } : chore
      ))
    }
  }

  const saveChore = async (e) => {
    e.preventDefault()
    try {
      const choreData = {
        family_id: family.family_id,
        name: choreForm.name,
        assigned_to: choreForm.assigned_to || null,
        due_date: choreForm.due_date || null,
        type: choreForm.type,
        recurring_frequency: choreForm.type === 'recurring' ? choreForm.recurring_frequency : null,
        recurring_days: choreForm.type === 'recurring' && choreForm.recurring_frequency === 'weekly' 
          ? choreForm.recurring_days : null,
        completed: false,
        completed_at: null,
        updated_at: new Date().toISOString()
      }

      if (editingChore) {
        // Update existing chore
        const { error } = await supabase
          .from('chores')
          .update(choreData)
          .eq('id', editingChore.id)

        if (!error) {
          loadChores() // Reload to get updated data with relationships
        }
      } else {
        // Create new chore
        const { error } = await supabase
          .from('chores')
          .insert(choreData)

        if (!error) {
          loadChores() // Reload to get new data with relationships
        }
      }

      setShowChoreModal(false)
      setEditingChore(null)
      setChoreForm({
        name: '',
        assigned_to: '',
        due_date: '',
        type: 'one-time',
        recurring_frequency: 'daily',
        recurring_days: []
      })
    } catch (error) {
      console.error('Error saving chore:', error)
    }
  }

  const deleteChore = async (choreId) => {
    if (confirm('Are you sure you want to delete this chore?')) {
      try {
        const { error } = await supabase
          .from('chores')
          .delete()
          .eq('id', choreId)

        if (!error) {
          setChores(chores.filter(chore => chore.id !== choreId))
        }
      } catch (error) {
        console.error('Error deleting chore:', error)
      }
    }
  }

  const clearCompletedChores = async () => {
    if (!confirm('Are you sure you want to clear all completed chores? This will permanently delete them.')) {
      return
    }

    try {
      const { error } = await supabase
        .from('chores')
        .delete()
        .eq('family_id', family.family_id)
        .eq('archived_completed', true)

      if (error) throw error

      // Remove archived completed chores from local state
      setChores(chores.filter(chore => !chore.archived_completed))
      alert('Completed chores cleared successfully!')
    } catch (error) {
      console.error('Error clearing completed chores:', error)
      alert('Error clearing completed chores: ' + error.message)
    }
  }

  const toggleRecurringDay = (day) => {
    const currentDays = choreForm.recurring_days || []
    if (currentDays.includes(day)) {
      setChoreForm({
        ...choreForm,
        recurring_days: currentDays.filter(d => d !== day)
      })
    } else {
      setChoreForm({
        ...choreForm,
        recurring_days: [...currentDays, day]
      })
    }
  }

  const getChoreDescription = (chore) => {
    let desc = ''
    if (chore.type === 'one-time') {
      desc = chore.due_date ? `Due: ${new Date(chore.due_date).toLocaleDateString()}` : 'One-time task'
    } else if (chore.recurring_frequency === 'daily') {
      desc = 'Recurring: Daily'
    } else if (chore.recurring_frequency === 'weekly') {
      const days = chore.recurring_days || []
      desc = days.length === 0 ? 'Recurring: Weekly' : `Recurring: ${days.join(', ')}`
    }
    
    if (chore.completed_at) {
      const completedDate = new Date(chore.completed_at)
      desc += ` • Completed: ${completedDate.toLocaleDateString()} at ${completedDate.toLocaleTimeString()}`
    }
    
    return desc
  }

  // Filter chores based on active tab and archived state
  // Active tab: chores that are not completed OR completed but not yet archived
  // Completed tab: chores that are completed AND archived
  const activeChores = chores.filter(chore => !chore.completed || !chore.archived_completed)
  const completedChores = chores.filter(chore => chore.completed && chore.archived_completed)
  const displayChores = activeTab === 'active' ? activeChores : completedChores

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-lg text-gray-600">Loading chores...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Chore Chart</h2>
        <div className="flex space-x-2">
          <button
            onClick={() => {
              setEditingChore(null)
              setChoreForm({
                name: '',
                assigned_to: '',
                due_date: '',
                type: 'one-time',
                recurring_frequency: 'daily',
                recurring_days: []
              })
              setShowChoreModal(true)
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            ➕ Add Chore
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('active')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'active'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              🎯 Active Chores ({activeChores.length})
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'completed'
                  ? 'border-green-500 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              ✅ Completed ({completedChores.length})
            </button>
            {/* Clear Completed button only shows in completed tab */}
            {activeTab === 'completed' && completedChores.length > 0 && (
              <button
                onClick={clearCompletedChores}
                className="ml-auto py-2 px-4 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
              >
                🗑️ Clear Completed
              </button>
            )}
          </nav>
        </div>

        {/* Chore List */}
        <div className="p-6">
          <div className="grid gap-4">
            {displayChores.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">
                  {activeTab === 'active' ? '🎯' : '✅'}
                </div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">
                  {activeTab === 'active' ? 'No active chores' : 'No completed chores'}
                </h3>
                <p className="text-gray-500">
                  {activeTab === 'active' 
                    ? 'All chores are complete! Great job!' 
                    : 'Complete some chores to see them here.'}
                </p>
              </div>
            ) : (
              displayChores.map(chore => (
                <div key={chore.id} className={`rounded-lg shadow p-4 flex items-center justify-between ${
                  chore.completed ? 'bg-green-50 border border-green-200' : 'bg-white border border-gray-200'
                }`}>
                  <div className="flex items-center space-x-4">
                    <input
                      type="checkbox"
                      checked={chore.completed}
                      onChange={() => toggleChoreComplete(chore.id, chore.completed)}
                      className="w-5 h-5"
                    />
                    <div>
                      <div className={`font-medium ${chore.completed ? 'line-through text-gray-500' : 'text-gray-800'}`}>
                        {chore.name}
                      </div>
                      <div className="text-sm text-gray-600">
                        Assigned to: {chore.family_members?.name || 'Unassigned'} | {getChoreDescription(chore)}
                      </div>
                      <div className="flex items-center space-x-2 mt-2">
                        {chore.type === 'recurring' && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            🔄 {chore.recurring_frequency === 'daily' ? 'Daily' : 'Weekly'}
                          </span>
                        )}
                        {chore.completed && !chore.archived_completed && (
                          <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                            ⏰ Will move to completed at next reset
                          </span>
                        )}
                        {chore.completed && chore.archived_completed && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                            ✅ Completed
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        setEditingChore(chore)
                        setChoreForm({
                          name: chore.name,
                          assigned_to: chore.assigned_to || '',
                          due_date: chore.due_date || '',
                          type: chore.type || 'one-time',
                          recurring_frequency: chore.recurring_frequency || 'daily',
                          recurring_days: chore.recurring_days || []
                        })
                        setShowChoreModal(true)
                      }}
                      className="bg-blue-500 text-white px-2 py-1 rounded text-sm hover:bg-blue-600"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => deleteChore(chore.id)}
                      className="bg-red-500 text-white px-2 py-1 rounded text-sm hover:bg-red-600"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Chores
