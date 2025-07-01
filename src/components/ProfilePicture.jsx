import React, { useState, useRef } from 'react'
import { supabase } from '../supabase.js'

const ProfilePicture = ({ 
  member, 
  size = 'medium', 
  editable = false, 
  onUpdate = null 
}) => {
  const [uploading, setUploading] = useState(false)
  const [imageUrl, setImageUrl] = useState(member?.profile_picture || null)
  const fileInputRef = useRef(null)

  const sizeClasses = {
    small: 'w-8 h-8 text-xs',
    medium: 'w-12 h-12 text-sm',
    large: 'w-20 h-20 text-lg',
    xlarge: 'w-32 h-32 text-2xl'
  }

  const getImageUrl = (path) => {
    if (!path) return null
    
    // If it's already a full URL, return it
    if (path.startsWith('http')) return path
    
    // Get the public URL from Supabase storage
    const { data } = supabase.storage
      .from('profile-pictures')
      .getPublicUrl(path)
    
    return data.publicUrl
  }

  const uploadProfilePicture = async (event) => {
    try {
      setUploading(true)
      
      const file = event.target.files[0]
      if (!file) return

      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file')
        return
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB')
        return
      }

      const fileExt = file.name.split('.').pop()
      const fileName = `${member.id}-${Date.now()}.${fileExt}`

      // Upload to Supabase storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('profile-pictures')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        console.error('Upload error:', uploadError)
        alert('Error uploading image')
        return
      }

      // Update the family member record with the new profile picture path
      const { error: updateError } = await supabase
        .from('family_members')
        .update({ profile_picture: uploadData.path })
        .eq('id', member.id)

      if (updateError) {
        console.error('Update error:', updateError)
        alert('Error saving profile picture')
        return
      }

      // Update local state
      const newImageUrl = getImageUrl(uploadData.path)
      setImageUrl(newImageUrl)
      
      // Call parent update function if provided
      if (onUpdate) {
        onUpdate({ ...member, profile_picture: uploadData.path })
      }

      console.log('Profile picture updated successfully!')
      
    } catch (error) {
      console.error('Error uploading profile picture:', error)
      alert('Error uploading profile picture')
    } finally {
      setUploading(false)
    }
  }

  const removeProfilePicture = async () => {
    if (!confirm('Remove profile picture?')) return

    try {
      setUploading(true)

      // Remove from storage if there's an existing picture
      if (member.profile_picture && !member.profile_picture.startsWith('http')) {
        await supabase.storage
          .from('profile-pictures')
          .remove([member.profile_picture])
      }

      // Update the database
      const { error } = await supabase
        .from('family_members')
        .update({ profile_picture: null })
        .eq('id', member.id)

      if (error) {
        console.error('Remove error:', error)
        alert('Error removing profile picture')
        return
      }

      setImageUrl(null)
      
      if (onUpdate) {
        onUpdate({ ...member, profile_picture: null })
      }

    } catch (error) {
      console.error('Error removing profile picture:', error)
      alert('Error removing profile picture')
    } finally {
      setUploading(false)
    }
  }

  const currentImageUrl = imageUrl ? getImageUrl(imageUrl) : null

  return (
    <div className="relative inline-block">
      <div className={`${sizeClasses[size]} rounded-full bg-gray-200 flex items-center justify-center overflow-hidden relative group`}>
        {currentImageUrl ? (
          <img 
            src={currentImageUrl} 
            alt={member?.name || 'Profile'} 
            className="w-full h-full object-cover"
            onError={() => setImageUrl(null)} // Fallback if image fails to load
          />
        ) : (
          <span className="text-gray-500">
            {member?.name ? member.name.charAt(0).toUpperCase() : '👤'}
          </span>
        )}
        
        {/* Upload overlay for editable mode */}
        {editable && (
          <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            {uploading ? (
              <div className="text-white text-xs">...</div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-white text-xs font-medium"
                disabled={uploading}
              >
                📷
              </button>
            )}
          </div>
        )}
      </div>

      {/* Hidden file input */}
      {editable && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={uploadProfilePicture}
          className="hidden"
          disabled={uploading}
        />
      )}

      {/* Remove button for editable mode */}
      {editable && currentImageUrl && !uploading && (
        <button
          onClick={removeProfilePicture}
          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 flex items-center justify-center"
          title="Remove picture"
        >
          ✕
        </button>
      )}

      {/* Loading indicator */}
      {uploading && (
        <div className="absolute inset-0 bg-white bg-opacity-75 rounded-full flex items-center justify-center">
          <div className="animate-spin text-blue-600">⟳</div>
        </div>
      )}
    </div>
  )
}

export default ProfilePicture
