import React, { useState, useEffect } from 'react'
import { supabase, initiateGoogleCalendarAuth, syncGoogleCalendarEvents, disconnectGoogleCalendar, isGoogleCalendarConnected } from '../supabase.js'
import GoogleAuthCallback from './GoogleAuthCallback.jsx'

const EnhancedCalendar = ({ family }) => {
  const [events, setEvents] = useState([])
  const [syncSettings, setSyncSettings] = useState(null)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState('month') // 'month', 'week', 'list'
  const [showEventModal, setShowEventModal] = useState(false)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [showGoogleCallback, setShowGoogleCallback] = useState(false)
  const [editingEvent, setEditingEvent] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [googleConnected, setGoogleConnected] = useState(false)
  const [eventForm, setEventForm] = useState({
    title: '',
    event_date: '',
    event_time: '',
    end_date: '',
    end_time: '',
    description: '',
    location: '',
    all_day: false,
    color: '#3b82f6'
  })

  const eventColors = [
    { value: '#3b82f6', name: 'Blue' },
    { value: '#10b981', name: 'Green' },
    { value: '#f59e0b', name: 'Orange' },
    { value: '#ef4444', name: 'Red' },
    { value: '#8b5cf6', name: 'Purple' },
    { value: '#06b6d4', name: 'Cyan' },
    { value: '#84cc16', name: 'Lime' },
    { value: '#f97316', name: 'Amber' }
  ]

  // Detect Google auth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('code') || urlParams.get('error')) {
      setShowGoogleCallback(true)
    }
  }, [])

  useEffect(() => {
    if (family) {
      loadEvents()
      loadSyncSettings()
      checkGoogleConnection()
    }
  }, [family, currentDate])

  const loadEvents = async () => {
    try {
      // Get events for current month view
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
      
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('family_id', family.family_id)
        .gte('event_date', startOfMonth.toISOString().split('T')[0])
        .lte('event_date', endOfMonth.toISOString().split('T')[0])
        .order('event_date', { ascending: true })

      if (error) throw error
      setEvents(data || [])
    } catch (error) {
      console.error('Error loading events:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadSyncSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('calendar_sync_settings')
        .select('*')
        .eq('family_id', family.family_id)
        .single()

      if (error && error.code !== 'PGRST116') throw error
      setSyncSettings(data)
    } catch (error) {
      console.error('Error loading sync settings:', error)
    }
  }

  const checkGoogleConnection = async () => {
    try {
      const connected = await isGoogleCalendarConnected(family.family_id)
      setGoogleConnected(connected)
    } catch (error) {
      console.error('Error checking Google connection:', error)
      setGoogleConnected(false)
    }
  }

  const saveEvent = async (e) => {
    e.preventDefault()
    try {
      const eventData = {
        family_id: family.family_id,
        title: eventForm.title,
        event_date: eventForm.event_date,
        event_time: eventForm.all_day ? null : eventForm.event_time || null,
        end_date: eventForm.end_date || eventForm.event_date,
        end_time: eventForm.all_day ? null : eventForm.end_time || null,
        description: eventForm.description,
        location: eventForm.location,
        all_day: eventForm.all_day,
        color: eventForm.color,
        external_source: 'manual'
      }

      if (editingEvent) {
        const { error } = await supabase
          .from('calendar_events')
          .update(eventData)
          .eq('id', editingEvent.id)

        if (!error) {
          setEvents(events.map(event => 
            event.id === editingEvent.id ? { ...event, ...eventData } : event
          ))
        }
      } else {
        const { data, error } = await supabase
          .from('calendar_events')
          .insert(eventData)
          .select()
          .single()

        if (!error) {
          setEvents([...events, data])
        }
      }

      setShowEventModal(false)
      setEditingEvent(null)
      setEventForm({
        title: '',
        event_date: '',
        event_time: '',
        end_date: '',
        end_time: '',
        description: '',
        location: '',
        all_day: false,
        color: '#3b82f6'
      })
    } catch (error) {
      console.error('Error saving event:', error)
      alert('Error saving event: ' + error.message)
    }
  }

  const deleteEvent = async (eventId) => {
    if (confirm('Are you sure you want to delete this event?')) {
      try {
        const { error } = await supabase
          .from('calendar_events')
          .delete()
          .eq('id', eventId)

        if (!error) {
          setEvents(events.filter(event => event.id !== eventId))
        }
      } catch (error) {
        console.error('Error deleting event:', error)
        alert('Error deleting event: ' + error.message)
      }
    }
  }

  const handleGoogleCalendarAction = async () => {
    if (!googleConnected) {
      // First time setup - initiate OAuth
      try {
        initiateGoogleCalendarAuth()
      } catch (error) {
        console.error('Error initiating Google auth:', error)
        alert('Error: ' + error.message)
      }
      return
    }
    
    // Already connected - sync events
    setSyncing(true)
    try {
      const result = await syncGoogleCalendarEvents(family.family_id)
      alert(result.message)
      loadEvents() // Reload events to show newly synced ones
      loadSyncSettings() // Reload sync settings
    } catch (error) {
      console.error('Error syncing:', error)
      alert('Error syncing Google Calendar: ' + error.message)
    } finally {
      setSyncing(false)
    }
  }

  const handleDisconnectGoogle = async () => {
    if (confirm('Are you sure you want to disconnect Google Calendar? This will remove all synced Google events.')) {
      try {
        await disconnectGoogleCalendar(family.family_id)
        setGoogleConnected(false)
        loadEvents() // Reload to remove Google events
        loadSyncSettings()
        alert('Google Calendar disconnected successfully')
      } catch (error) {
        console.error('Error disconnecting:', error)
        alert('Error disconnecting Google Calendar: ' + error.message)
      }
    }
  }

  const handleGoogleAuthSuccess = () => {
    setShowGoogleCallback(false)
    setShowSyncModal(false)
    setGoogleConnected(true)
    loadSyncSettings() // Reload sync settings
    loadEvents() // Reload events
    alert('Google Calendar connected successfully!')
  }

  const handleGoogleAuthError = (error) => {
    setShowGoogleCallback(false)
    setShowSyncModal(false)
    console.error('Google auth error:', error)
    alert('Failed to connect Google Calendar: ' + error.message)
  }

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    const days = []
    
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null)
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day))
    }
    
    return days
  }

  const getEventsForDate = (date) => {
    if (!date) return []
    const dateStr = date.toISOString().split('T')[0]
    return events.filter(event => event.event_date === dateStr)
  }

  const formatTime = (timeString) => {
    if (!timeString) return ''
    const [hours, minutes] = timeString.split(':')
    const date = new Date()
    date.setHours(parseInt(hours), parseInt(minutes))
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const navigateMonth = (direction) => {
    const newDate = new Date(currentDate)
    newDate.setMonth(currentDate.getMonth() + direction)
    setCurrentDate(newDate)
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  const MonthView = () => {
    const days = getDaysInMonth()
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="flex items-center justify-between p-4 border-b">
          <button
            onClick={() => navigateMonth(-1)}
            className="p-2 hover:bg-gray-100 rounded text-lg"
          >
            ←
          </button>
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-semibold">
              {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h3>
            <button
              onClick={goToToday}
              className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded hover:bg-blue-200"
            >
              Today
            </button>
          </div>
          <button
            onClick={() => navigateMonth(1)}
            className="p-2 hover:bg-gray-100 rounded text-lg"
          >
            →
          </button>
        </div>
        
        <div className="grid grid-cols-7 border-b">
          {dayNames.map(day => (
            <div key={day} className="p-3 text-center text-sm font-medium text-gray-500 border-r last:border-r-0">
              {day}
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-7">
          {days.map((date, index) => {
            const dayEvents = date ? getEventsForDate(date) : []
            const isToday = date && date.toDateString() === new Date().toDateString()
            
            return (
              <div
                key={index}
                className={`min-h-24 p-2 border-r border-b last:border-r-0 ${
                  date ? 'cursor-pointer hover:bg-gray-50' : 'bg-gray-50'
                } ${isToday ? 'bg-blue-50' : ''}`}
                onClick={() => {
                  if (date) {
                    setSelectedDate(date.toISOString().split('T')[0])
                    setEventForm(prev => ({ ...prev, event_date: date.toISOString().split('T')[0] }))
                    setShowEventModal(true)
                  }
                }}
              >
                {date && (
                  <>
                    <div className={`text-sm ${isToday ? 'font-bold text-blue-600' : 'text-gray-900'}`}>
                      {date.getDate()}
                    </div>
                    <div className="space-y-1 mt-1">
                      {dayEvents.slice(0, 3).map(event => (
                        <div
                          key={event.id}
                          className="text-xs p-1 rounded truncate text-white cursor-pointer"
                          style={{ backgroundColor: event.color }}
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingEvent(event)
                            setEventForm({
                              title: event.title,
                              event_date: event.event_date,
                              event_time: event.event_time || '',
                              end_date: event.end_date || event.event_date,
                              end_time: event.end_time || '',
                              description: event.description || '',
                              location: event.location || '',
                              all_day: event.all_day,
                              color: event.color
                            })
                            setShowEventModal(true)
                          }}
                        >
                          {event.external_source === 'google' && '📅 '}
                          {event.all_day ? event.title : `${formatTime(event.event_time)} ${event.title}`}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-xs text-gray-500">
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const ListView = () => (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold">Upcoming Events</h3>
      </div>
      <div className="divide-y">
        {events.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No events scheduled
          </div>
        ) : (
          events.map(event => (
            <div key={event.id} className="p-4 hover:bg-gray-50">
              <div className="flex items-start justify-between">
                <div className="flex-grow">
                  <div className="flex items-center space-x-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: event.color }}
                    />
                    <h4 className="font-medium">{event.title}</h4>
                    {event.external_source === 'google' && (
                      <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded">
                        📅 Google
                      </span>
                    )}
                    {event.external_source === 'manual' && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                        Manual
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {new Date(event.event_date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric'
                    })}
                    {event.event_time && !event.all_day && ` at ${formatTime(event.event_time)}`}
                    {event.all_day && ' (All day)'}
                  </div>
                  {event.location && (
                    <div className="text-sm text-gray-500 mt-1">
                      📍 {event.location}
                    </div>
                  )}
                  {event.description && (
                    <div className="text-sm text-gray-600 mt-1">
                      {event.description}
                    </div>
                  )}
                </div>
                <div className="flex space-x-2 ml-4">
                  <button
                    onClick={() => {
                      setEditingEvent(event)
                      setEventForm({
                        title: event.title,
                        event_date: event.event_date,
                        event_time: event.event_time || '',
                        end_date: event.end_date || event.event_date,
                        end_time: event.end_time || '',
                        description: event.description || '',
                        location: event.location || '',
                        all_day: event.all_day,
                        color: event.color
                      })
                      setShowEventModal(true)
                    }}
                    className="text-blue-600 hover:text-blue-800"
                    disabled={event.external_source === 'google'}
                    title={event.external_source === 'google' ? 'Google Calendar events cannot be edited here' : 'Edit event'}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => deleteEvent(event.id)}
                    className="text-red-600 hover:text-red-800"
                    disabled={event.external_source === 'google'}
                    title={event.external_source === 'google' ? 'Google Calendar events cannot be deleted here' : 'Delete event'}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-lg text-gray-600">Loading calendar...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Family Calendar</h2>
        <div className="flex space-x-2">
          {/* View Mode Selector */}
          <div className="bg-white rounded-lg shadow p-1 flex">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1 rounded text-sm font-medium ${
                viewMode === 'month'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 rounded text-sm font-medium ${
                viewMode === 'list'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              List
            </button>
          </div>
          
          <button
            onClick={() => setShowSyncModal(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
          >
            🔗 Sync Calendars
          </button>
          
          <button
            onClick={() => {
              setEditingEvent(null)
              setEventForm({
                title: '',
                event_date: new Date().toISOString().split('T')[0],
                event_time: '',
                end_date: '',
                end_time: '',
                description: '',
                location: '',
                all_day: false,
                color: '#3b82f6'
              })
              setShowEventModal(true)
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            ➕ Add Event
          </button>
        </div>
      </div>

      {/* Google Calendar Status Banner */}
      {googleConnected && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-green-800 text-sm">
              Google Calendar connected
              {syncSettings?.last_sync_at && (
                <span className="text-green-600 ml-2">
                  • Last sync: {new Date(syncSettings.last_sync_at).toLocaleString()}
                </span>
              )}
            </span>
          </div>
          <button
            onClick={handleGoogleCalendarAction}
            disabled={syncing}
            className="text-green-700 hover:text-green-900 text-sm font-medium"
          >
            {syncing ? 'Syncing...' : '🔄 Sync Now'}
          </button>
        </div>
      )}

      {/* Calendar Views */}
      {viewMode === 'month' && <MonthView />}
      {viewMode === 'list' && <ListView />}

      {/* Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {editingEvent ? 'Edit Event' : 'Add New Event'}
              </h3>
              <button
                onClick={() => setShowEventModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ✕
              </button>
            </div>

            {editingEvent?.external_source === 'google' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-blue-800 text-sm">
                  📅 This is a Google Calendar event. Edit it in Google Calendar to see changes here.
                </p>
              </div>
            )}
            
            <form onSubmit={saveEvent} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Event Title</label>
                <input
                  type="text"
                  value={eventForm.title}
                  onChange={(e) => setEventForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter event title"
                  required
                  disabled={editingEvent?.external_source === 'google'}
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={eventForm.all_day}
                  onChange={(e) => setEventForm(prev => ({ ...prev, all_day: e.target.checked }))}
                  className="w-4 h-4"
                  disabled={editingEvent?.external_source === 'google'}
                />
                <label className="text-sm font-medium text-gray-700">All Day Event</label>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                  <input
                    type="date"
                    value={eventForm.event_date}
                    onChange={(e) => setEventForm(prev => ({ ...prev, event_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                    disabled={editingEvent?.external_source === 'google'}
                  />
                </div>
                {!eventForm.all_day && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Start Time</label>
                    <input
                      type="time"
                      value={eventForm.event_time}
                      onChange={(e) => setEventForm(prev => ({ ...prev, event_time: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={editingEvent?.external_source === 'google'}
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                  <input
                    type="date"
                    value={eventForm.end_date}
                    onChange={(e) => setEventForm(prev => ({ ...prev, end_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={editingEvent?.external_source === 'google'}
                  />
                </div>
                {!eventForm.all_day && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">End Time</label>
                    <input
                      type="time"
                      value={eventForm.end_time}
                      onChange={(e) => setEventForm(prev => ({ ...prev, end_time: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={editingEvent?.external_source === 'google'}
                    />
                  </div>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Location (Optional)</label>
                <input
                  type="text"
                  value={eventForm.location}
                  onChange={(e) => setEventForm(prev => ({ ...prev, location: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter location"
                  disabled={editingEvent?.external_source === 'google'}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description (Optional)</label>
                <textarea
                  value={eventForm.description}
                  onChange={(e) => setEventForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Enter event description..."
                  disabled={editingEvent?.external_source === 'google'}
                />
              </div>

              {editingEvent?.external_source !== 'google' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
                  <div className="flex space-x-2">
                    {eventColors.map(color => (
                      <button
                        key={color.value}
                        type="button"
                        onClick={() => setEventForm(prev => ({ ...prev, color: color.value }))}
                        className={`w-8 h-8 rounded-full ${
                          eventForm.color === color.value 
                            ? 'ring-2 ring-offset-2 ring-gray-400' 
                            : ''
                        }`}
                        style={{ backgroundColor: color.value }}
                        title={color.name}
                      />
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  {editingEvent?.external_source === 'google' ? 'Close' : 'Cancel'}
                </button>
                {editingEvent?.external_source !== 'google' && (
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    💾 Save
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Calendar Sync Modal */}
      {showSyncModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Calendar Sync</h3>
            </div>
            
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Google Calendar</h4>
                <p className="text-sm text-blue-700 mb-3">
                  {googleConnected 
                    ? 'Connected! Your Google Calendar events are synced.'
                    : 'Sync events with your Google Calendar automatically.'
                  }
                </p>
                <div className="flex space-x-2">
                  <button
                    onClick={handleGoogleCalendarAction}
                    disabled={syncing}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {syncing ? 'Syncing...' : googleConnected ? '🔄 Sync Now' : '🔗 Connect Google Calendar'}
                  </button>
                  {googleConnected && (
                    <button
                      onClick={handleDisconnectGoogle}
                      className="bg-red-100 text-red-700 px-4 py-2 rounded hover:bg-red-200"
                    >
                      🔌 Disconnect
                    </button>
                  )}
                </div>
                {googleConnected && (
                  <div className="text-xs text-green-600 mt-2 flex items-center">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                    Connected and syncing
                  </div>
                )}
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Apple Calendar</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Import events from Apple Calendar (Coming Soon).
                </p>
                <button
                  disabled
                  className="bg-gray-400 text-white px-4 py-2 rounded cursor-not-allowed"
                >
                  🍎 Coming Soon
                </button>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Outlook Calendar</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Sync with Microsoft Outlook (Coming Soon).
                </p>
                <button
                  disabled
                  className="bg-gray-400 text-white px-4 py-2 rounded cursor-not-allowed"
                >
                  📧 Coming Soon
                </button>
              </div>

              {syncSettings && syncSettings.last_sync_at && (
                <div className="text-sm text-gray-600 text-center">
                  Last sync: {new Date(syncSettings.last_sync_at).toLocaleString()}
                </div>
              )}

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <h5 className="font-medium text-yellow-800 mb-1">About Calendar Sync</h5>
                <p className="text-sm text-yellow-700">
                  Google Calendar events are imported as read-only. To edit or delete them, 
                  use Google Calendar directly. Changes will sync automatically.
                </p>
              </div>
            </div>
            
            <div className="flex justify-end mt-6">
              <button
                onClick={() => setShowSyncModal(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Auth Callback Component */}
      {showGoogleCallback && (
        <GoogleAuthCallback 
          family={family}
          onSuccess={handleGoogleAuthSuccess}
          onError={handleGoogleAuthError}
        />
      )}
    </div>
  )
}

export default EnhancedCalendar
