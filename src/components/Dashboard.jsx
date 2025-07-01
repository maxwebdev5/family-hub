import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase.js'
import ProfilePicture from './ProfilePicture.jsx'

const Dashboard = ({ family }) => {
  const [chores, setChores] = useState([])
  const [meals, setMeals] = useState([])
  const [events, setEvents] = useState([])
  const [familyMembers, setFamilyMembers] = useState([])
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().split('T')[0]
  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })

  useEffect(() => {
    if (family) {
      loadDashboardData()
    }
  }, [family])

  const loadDashboardData = async () => {
    try {
      // Load today's chores
      const { data: choresData } = await supabase
        .from('chores')
        .select(`
          *,
          family_members!assigned_to(name)
        `)
        .eq('family_id', family.family_id)
        .or(`due_date.eq.${today},type.eq.recurring`)

      // Load today's meals
      const { data: mealsData } = await supabase
        .from('meals')
        .select('*')
        .eq('family_id', family.family_id)
        .eq('week_number', 1)
        .eq('day_of_week', todayName)

      // Load upcoming events
      const { data: eventsData } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('family_id', family.family_id)
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .limit(3)

      // Load family members
      const { data: membersData } = await supabase
        .from('family_members')
        .select('*')
        .eq('family_id', family.family_id)

      setChores(choresData || [])
      setMeals(mealsData || [])
      setEvents(eventsData || [])
      setFamilyMembers(membersData || [])
    } catch (error) {
      console.error('Error loading dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleChoreComplete = async (choreId, completed) => {
    try {
      const { error } = await supabase
        .from('chores')
        .update({ completed: !completed, updated_at: new Date().toISOString() })
        .eq('id', choreId)

      if (!error) {
        setChores(chores.map(chore => 
          chore.id === choreId ? { ...chore, completed: !completed } : chore
        ))
      }
    } catch (error) {
      console.error('Error updating chore:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-lg text-gray-600">Loading dashboard...</div>
      </div>
    )
  }

  // Filter today's chores (due today or recurring)
  const todaysChores = chores.filter(chore => {
    if (chore.due_date === today) return true
    if (chore.type === 'recurring') {
      if (chore.recurring_frequency === 'daily') return true
      if (chore.recurring_frequency === 'weekly' && chore.recurring_days?.includes(todayName)) return true
    }
    return false
  })

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Today's Chores */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <span className="text-2xl mr-2">✅</span>
            Today's Chores
          </h3>
          <div className="space-y-3">
            {todaysChores.length === 0 ? (
              <p className="text-gray-500 italic">No chores for today!</p>
            ) : (
              todaysChores.map(chore => (
                <div key={chore.id} className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={chore.completed}
                    onChange={() => toggleChoreComplete(chore.id, chore.completed)}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className={chore.completed ? 'line-through text-gray-500' : 'text-gray-800'}>
                    {chore.name} - {chore.family_members?.name || 'Unassigned'}
                  </span>
                  {chore.type === 'recurring' && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      🔄
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Today's Meals */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <span className="text-2xl mr-2">🍽️</span>
            Today's Meals
          </h3>
          <div className="space-y-2">
            {['breakfast', 'lunch', 'dinner'].map(mealType => {
              const meal = meals.find(m => m.meal_type === mealType)
              return (
                <div key={mealType}>
                  <strong className="capitalize">{mealType}:</strong>{' '}
                  {meal?.name || 'Not planned'}
                  {meal?.link && (
                    <a 
                      href={meal.link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="ml-2 text-blue-600 hover:text-blue-800"
                    >
                      🔗
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Upcoming Events */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <span className="text-2xl mr-2">📅</span>
            Upcoming Events
          </h3>
          <div className="space-y-3">
            {events.length === 0 ? (
              <p className="text-gray-500 italic">No upcoming events</p>
            ) : (
              events.map(event => (
                <div key={event.id} className="flex items-start space-x-3">
                  <span className="text-purple-600 mt-1">🕐</span>
                  <div>
                    <div className="font-medium text-gray-800">{event.title}</div>
                    <div className="text-sm text-gray-600">
                      {new Date(event.event_date).toLocaleDateString()} 
                      {event.event_time && ` at ${event.event_time}`}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

     {/* Family Members Overview */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <span className="text-2xl mr-2">👥</span>
          Family Overview
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {familyMembers.map(member => {
            const memberChores = chores.filter(chore => 
              chore.assigned_to === member.id && !chore.completed
            )
            return (
              <div key={member.id} className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="flex justify-center mb-2">
                  <ProfilePicture member={member} size="xlarge" />
                </div>
                <div className="font-medium">{member.name}</div>
                <div className="text-sm text-gray-600">
                  {memberChores.length} pending chores
                </div>
                {member.role === 'admin' && (
                  <div className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded mt-1">
                    Admin
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{todaysChores.length}</div>
          <div className="text-sm text-gray-600">Today's Chores</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-2xl font-bold text-green-600">
            {todaysChores.filter(c => c.completed).length}
          </div>
          <div className="text-sm text-gray-600">Completed</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-2xl font-bold text-purple-600">{familyMembers.length}</div>
          <div className="text-sm text-gray-600">Family Members</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-2xl font-bold text-orange-600">{events.length}</div>
          <div className="text-sm text-gray-600">Upcoming Events</div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
