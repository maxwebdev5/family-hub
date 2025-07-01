import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase.js'

const Calendar = ({ family }) => {
  const [events, setEvents] = useState([])
  const [showEventModal, setShowEventModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('upcoming') // 'upcoming' or 'all'
  const [eventForm, setEventForm] = useState({
    title: '',
    event_date: '',
    event_time: '',
    description: ''
  })

  useEffect(() => {
    if (family) {
      loadEvents()
    }
  }, [family])

  const loadEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('family_id', family.family_id)
        .order('event_date', { ascending: true })

      if (error) throw error
      setEvents(data || [])
    } catch (error) {
      console.error('Error loading events:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveEvent = async (e) => {
    e.preventDefault()
    try {
      const eventData = {
        family_id: family.family_id,
        title: eventForm.title,
        event_date: eventForm.event_date,
        event_time: eventForm.event_time || null,
        description: eventForm.description
      }

      if (editingEvent) {
        // Update existing event
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
        // Create new event
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
        description: ''
      })
    } catch (error) {
      console.error('Error saving event:', error)
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
      }
    }
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow'
    } else {
      return date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'short', 
        day: 'numeric' 
      })
    }
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

  const getEventsByCategory = () => {
    const today = new Date().toISOString().split('T')[0]
    
    if (viewMode === 'upcoming') {
      return events.filter(event => event.event_date >= today)
    } else {
      return events
    }
  }

  const groupEventsByDate = (eventsList) => {
    const grouped = {}
    eventsList.forEach(event => {
      const date = event.event_date
      if (!grouped[date]) {
        grouped[date] = []
      }
      grouped[date].push(event)
    })
    return grouped
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-lg text-gray-600">Loading calendar...</div>
      </div>
    )
  }

  const displayEvents = getEventsByCategory()
  const groupedEvents = groupEventsByDate(displayEvents)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Family Calendar</h2>
        <div className="flex space-x-2">
          <div className="bg-white rounded-lg shadow p-1 flex">
            <button
              onClick={() => setViewMode('upcoming')}
              className={`px-3 py-1 rounded text-sm font-medium ${
                viewMode === 'upcoming'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Upcoming
            </button>
            <button
              onClick={() => setViewMode('all')}
              className={`px-3 py-1 rounded text-sm font-medium ${
                viewMode === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              All Events
            </button>
          </div>
          <button
            onClick={() => {
              setEditingEvent(null)
              setEventForm({
                title: '',
                event_date: '',
                event_time: '',
                description: ''
              })
              setShowEventModal(true)
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            ➕ Add Event
          </button>
        </div>
      </div>

      {/* Calendar Sync Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center">
          <span className="text-2xl mr-3">📅</span>
          <div>
            <h3 className="font-semibold text-blue-900">Calendar Integration</h3>
            <p className="text-sm text-blue-700">
              External calendar sync (Google, Apple, Outlook) can be added as a future enhancement. 
              For now, manually add your important family events here.
            </p>
          </div>
        </div>
      </div>

      {/* Events List */}
      <div className="space-y-4">
        {Object.keys(groupedEvents).length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <div className="text-4xl mb-4">📅</div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              {viewMode === 'upcoming' ? 'No upcoming events' : 'No events yet'}
            </h3>
            <p className="text-gray-500">Click "Add Event" to get started!</p>
          </div>
        ) : (
          Object.keys(groupedEvents)
            .sort()
            .map(date => (
              <div key={date} className="bg-white rounded-lg shadow">
                <div className="bg-gray-50 px-6 py-3 border-b">
                  <h3 className="font-semibold text-gray-800">
                    {formatDate(date)} - {new Date(date).toLocaleDateString()}
                  </h3>
                </div>
                <div className="p-6 space-y-4">
                  {groupedEvents[date].map(event => (
                    <div key={event.id} className="flex items-start justify-between border-l-4 border-blue-500 pl-4">
                      <div className="flex-grow">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-medium text-gray-800">{event.title}</h4>
                          {event.event_time && (
                            <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                              {formatTime(event.event_time)}
                            </span>
                          )}
                        </div>
                        {event.description && (
                          <p className="text-sm text-gray-600 mt-1">{event.description}</p>
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
                              description: event.description || ''
                            })
                            setShowEventModal(true)
                          }}
                          className="bg-blue-500 text-white px-2 py-1 rounded text-sm hover:bg-blue-600"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => deleteEvent(event.id)}
                          className="bg-red-500 text-white px-2 py-1 rounded text-sm hover:bg-red-600"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
        )}
      </div>

      {/* Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full p-6">
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
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                  <input
                    type="date"
                    value={eventForm.event_date}
                    onChange={(e) => setEventForm(prev => ({ ...prev, event_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Time (Optional)</label>
                  <input
                    type="time"
                    value={eventForm.event_time}
                    onChange={(e) => setEventForm(prev => ({ ...prev, event_time: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description (Optional)</label>
                <textarea
                  value={eventForm.description}
                  onChange={(e) => setEventForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Enter event description..."
                />
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  💾 Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Calendar
