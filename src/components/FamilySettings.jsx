import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase.js'
import ProfilePicture from './ProfilePicture.jsx'

const FamilySettings = ({ family }) => {
  const [familyMembers, setFamilyMembers] = useState([])
  const [settings, setSettings] = useState({
    allow_children_edit_chores: false,
    allow_children_edit_meals: false,
    require_photo_verification: false,
    chore_points_enabled: false,
    daily_chore_reset_time: '06:00',
    weekly_chore_reset_day: 1,
    theme_color: 'blue',
    notifications_enabled: true
  })
  const [choreSettings, setChoreSettings] = useState({
    auto_reset_enabled: true,
    reset_time: '06:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showMemberModal, setShowMemberModal] = useState(false)
  const [editingMember, setEditingMember] = useState(null)
  const [memberForm, setMemberForm] = useState({
    name: '',
    role: 'child',
    date_of_birth: '',
    phone: ''
  })

  const rolePermissions = {
    admin: 'Full access to all features',
    parent: 'Can manage all family data',
    child: 'Limited access based on family settings'
  }

  const themeColors = [
    { value: 'blue', name: 'Blue', class: 'bg-blue-500' },
    { value: 'green', name: 'Green', class: 'bg-green-500' },
    { value: 'purple', name: 'Purple', class: 'bg-purple-500' },
    { value: 'pink', name: 'Pink', class: 'bg-pink-500' },
    { value: 'indigo', name: 'Indigo', class: 'bg-indigo-500' }
  ]

  const weekDays = [
    { value: 1, name: 'Monday' },
    { value: 2, name: 'Tuesday' },
    { value: 3, name: 'Wednesday' },
    { value: 4, name: 'Thursday' },
    { value: 5, name: 'Friday' },
    { value: 6, name: 'Saturday' },
    { value: 0, name: 'Sunday' }
  ]

  const timezones = [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Europe/Paris',
    'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney'
  ]

  useEffect(() => {
    if (family) {
      loadFamilyMembers()
      loadFamilySettings()
      loadChoreSettings()
    }
  }, [family])

  const loadFamilyMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('family_members')
        .select('*')
        .eq('family_id', family.family_id)
        .order('created_at', { ascending: true })

      if (error) throw error
      setFamilyMembers(data || [])
    } catch (error) {
      console.error('Error loading family members:', error)
    }
  }

  const loadFamilySettings = async () => {
    try {
      const { data, error } = await supabase
        .from('family_settings')
        .select('*')
        .eq('family_id', family.family_id)
        .single()

      if (error) throw error
      if (data) {
        setSettings({
          ...data,
          daily_chore_reset_time: data.daily_chore_reset_time?.substring(0, 5) || '06:00'
        })
      }
    } catch (error) {
      console.error('Error loading family settings:', error)
    }
  }

  const loadChoreSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('chore_settings')
        .select('*')
        .eq('family_id', family.family_id)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') throw error
      
      if (data) {
        setChoreSettings({
          auto_reset_enabled: data.auto_reset_enabled,
          reset_time: data.reset_time?.substring(0, 5) || '06:00',
          timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
        })
      }
    } catch (error) {
      console.error('Error loading chore settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    setSaving(true)
    try {
      // Save family settings
      const { error: familyError } = await supabase
        .from('family_settings')
        .update({
          ...settings,
          updated_at: new Date().toISOString()
        })
        .eq('family_id', family.family_id)

      if (familyError) throw familyError

      // Save chore settings - use UPDATE first, then INSERT if needed
      const { error: updateError } = await supabase
        .from('chore_settings')
        .update({
          auto_reset_enabled: choreSettings.auto_reset_enabled,
          reset_time: choreSettings.reset_time,
          timezone: choreSettings.timezone,
          updated_at: new Date().toISOString()
        })
        .eq('family_id', family.family_id)

      // If no rows were updated (doesn't exist), insert a new one
      if (updateError && updateError.code === 'PGRST116') {
        const { error: insertError } = await supabase
          .from('chore_settings')
          .insert({
            family_id: family.family_id,
            auto_reset_enabled: choreSettings.auto_reset_enabled,
            reset_time: choreSettings.reset_time,
            timezone: choreSettings.timezone,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })

        if (insertError) throw insertError
      } else if (updateError) {
        throw updateError
      }
      
      alert('Settings saved successfully!')
    } catch (error) {
      console.error('Error saving settings:', error)
      alert('Error saving settings: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const saveMember = async (e) => {
    e.preventDefault()
    try {
      const memberData = {
        name: memberForm.name,
        role: memberForm.role,
        date_of_birth: memberForm.date_of_birth || null,
        phone: memberForm.phone || null
      }

      if (editingMember) {
        const { error } = await supabase
          .from('family_members')
          .update(memberData)
          .eq('id', editingMember.id)

        if (!error) {
          setFamilyMembers(familyMembers.map(member => 
            member.id === editingMember.id ? { ...member, ...memberData } : member
          ))
        }
      } else {
        const { data, error } = await supabase
          .from('family_members')
          .insert({
            ...memberData,
            family_id: family.family_id,
            user_id: null // This will be a family member without login
          })
          .select()
          .single()

        if (!error) {
          setFamilyMembers([...familyMembers, data])
        }
      }

      setShowMemberModal(false)
      setEditingMember(null)
      setMemberForm({ name: '', role: 'child', date_of_birth: '', phone: '' })
    } catch (error) {
      console.error('Error saving member:', error)
    }
  }

  const deleteMember = async (memberId) => {
    if (confirm('Are you sure you want to remove this family member?')) {
      try {
        const { error } = await supabase
          .from('family_members')
          .delete()
          .eq('id', memberId)

        if (!error) {
          setFamilyMembers(familyMembers.filter(member => member.id !== memberId))
        }
      } catch (error) {
        console.error('Error deleting member:', error)
      }
    }
  }

  const getRoleColor = (role) => {
    const colors = {
      admin: 'bg-red-100 text-red-800',
      parent: 'bg-blue-100 text-blue-800',
      child: 'bg-green-100 text-green-800'
    }
    return colors[role] || 'bg-gray-100 text-gray-800'
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-lg text-gray-600">Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Family Settings</h2>

      {/* Family Members Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold">Family Members</h3>
          <button
            onClick={() => {
              setEditingMember(null)
              setMemberForm({ name: '', role: 'child', date_of_birth: '', phone: '' })
              setShowMemberModal(true)
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            ➕ Add Member
          </button>
        </div>

        <div className="grid gap-4">
          {familyMembers.map(member => (
            <div key={member.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center space-x-4">
                <ProfilePicture 
                  member={member} 
                  size="large" 
                  editable={true}
                  onUpdate={(updatedMember) => {
                    setFamilyMembers(familyMembers.map(m => 
                      m.id === updatedMember.id ? updatedMember : m
                    ))
                  }}
                />
                <div>
                  <div className="font-medium">{member.name}</div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(member.role)}`}>
                      {member.role}
                    </span>
                    {member.user_id && (
                      <span className="text-xs text-green-600">• Has account</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    {rolePermissions[member.role]}
                  </div>
                  {member.date_of_birth && (
                    <div className="text-xs text-gray-400">
                      Born: {new Date(member.date_of_birth).toLocaleDateString()}
                    </div>
                  )}
                  {member.phone && (
                    <div className="text-xs text-gray-400">
                      📞 {member.phone}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => {
                    setEditingMember(member)
                    setMemberForm({
                      name: member.name,
                      role: member.role,
                      date_of_birth: member.date_of_birth || '',
                      phone: member.phone || ''
                    })
                    setShowMemberModal(true)
                  }}
                  className="text-blue-600 hover:text-blue-800"
                >
                  ✏️
                </button>
                {member.role !== 'admin' && (
                  <button
                    onClick={() => deleteMember(member.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chore Reset Settings */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-6">Chore Reset Settings</h3>
        
        <div className="space-y-4">
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={choreSettings.auto_reset_enabled}
              onChange={(e) => setChoreSettings(prev => ({ ...prev, auto_reset_enabled: e.target.checked }))}
              className="w-4 h-4"
            />
            <div>
              <div className="font-medium">Enable automatic chore reset</div>
              <div className="text-sm text-gray-600">Automatically reset recurring chores at specified time each day</div>
            </div>
          </label>

          {choreSettings.auto_reset_enabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 ml-7">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reset Time
                </label>
                <input
                  type="time"
                  value={choreSettings.reset_time}
                  onChange={(e) => setChoreSettings(prev => ({ ...prev, reset_time: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Time when daily chore reset occurs</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Family Timezone
                </label>
                <select
                  value={choreSettings.timezone}
                  onChange={(e) => setChoreSettings(prev => ({ ...prev, timezone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {timezones.map(tz => (
                    <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Timezone for chore reset timing</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Permissions Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-6">Permissions & Features</h3>
        
        <div className="space-y-4">
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={settings.allow_children_edit_chores}
              onChange={(e) => setSettings(prev => ({ ...prev, allow_children_edit_chores: e.target.checked }))}
              className="w-4 h-4"
            />
            <div>
              <div className="font-medium">Allow children to edit chores</div>
              <div className="text-sm text-gray-600">Children can add, edit, and delete chores</div>
            </div>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={settings.allow_children_edit_meals}
              onChange={(e) => setSettings(prev => ({ ...prev, allow_children_edit_meals: e.target.checked }))}
              className="w-4 h-4"
            />
            <div>
              <div className="font-medium">Allow children to edit meal plans</div>
              <div className="text-sm text-gray-600">Children can modify meal planning</div>
            </div>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={settings.require_photo_verification}
              onChange={(e) => setSettings(prev => ({ ...prev, require_photo_verification: e.target.checked }))}
              className="w-4 h-4"
            />
            <div>
              <div className="font-medium">Require photo verification for chores</div>
              <div className="text-sm text-gray-600">Chores must include a photo to mark complete</div>
            </div>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={settings.notifications_enabled}
              onChange={(e) => setSettings(prev => ({ ...prev, notifications_enabled: e.target.checked }))}
              className="w-4 h-4"
            />
            <div>
              <div className="font-medium">Enable notifications</div>
              <div className="text-sm text-gray-600">Send reminders and updates</div>
            </div>
          </label>
        </div>
      </div>

      {/* Theme Settings */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-6">Appearance</h3>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Theme Color
          </label>
          <div className="flex space-x-3">
            {themeColors.map(color => (
              <button
                key={color.value}
                onClick={() => setSettings(prev => ({ ...prev, theme_color: color.value }))}
                className={`w-8 h-8 rounded-full ${color.class} ${
                  settings.theme_color === color.value 
                    ? 'ring-2 ring-offset-2 ring-gray-400' 
                    : ''
                }`}
                title={color.name}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={saveSettings}
          disabled={saving}
          className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : '💾 Save Settings'}
        </button>
      </div>

      {/* Member Modal */}
      {showMemberModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {editingMember ? 'Edit Family Member' : 'Add Family Member'}
              </h3>
              <button
                onClick={() => setShowMemberModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={saveMember} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                <input
                  type="text"
                  value={memberForm.name}
                  onChange={(e) => setMemberForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter member name"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                <select
                  value={memberForm.role}
                  onChange={(e) => setMemberForm(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="child">Child</option>
                  <option value="parent">Parent</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date of Birth (Optional)</label>
                <input
                  type="date"
                  value={memberForm.date_of_birth}
                  onChange={(e) => setMemberForm(prev => ({ ...prev, date_of_birth: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone (Optional)</label>
                <input
                  type="tel"
                  value={memberForm.phone}
                  onChange={(e) => setMemberForm(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="(555) 123-4567"
                />
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowMemberModal(false)}
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

export default FamilySettings
