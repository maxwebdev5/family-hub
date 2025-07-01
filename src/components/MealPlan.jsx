import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase.js'

const MealPlan = ({ family }) => {
  const [meals, setMeals] = useState({})
  const [currentWeek, setCurrentWeek] = useState(1)
  const [availableWeeks, setAvailableWeeks] = useState([1])
  const [showMealModal, setShowMealModal] = useState(false)
  const [editingMeal, setEditingMeal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mealForm, setMealForm] = useState({
    name: '',
    recipe: '',
    link: ''
  })

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const mealTypes = ['breakfast', 'lunch', 'dinner']

  useEffect(() => {
    if (family) {
      loadMealPlan()
    }
  }, [family, currentWeek])

  const loadMealPlan = async () => {
    try {
      // Load meals for current week
      const { data: mealsData, error } = await supabase
        .from('meals')
        .select('*')
        .eq('family_id', family.family_id)
        .eq('week_number', currentWeek)

      if (error) throw error

      // Load available weeks
      const { data: weeksData } = await supabase
        .from('meals')
        .select('week_number')
        .eq('family_id', family.family_id)

      const weeks = [...new Set(weeksData?.map(m => m.week_number) || [1])]
      setAvailableWeeks(weeks.sort((a, b) => a - b))

      // Organize meals by day and meal type
      const mealsByDay = {}
      daysOfWeek.forEach(day => {
        mealsByDay[day] = {}
        mealTypes.forEach(mealType => {
          const meal = mealsData?.find(m => m.day_of_week === day && m.meal_type === mealType)
          mealsByDay[day][mealType] = meal || {
            name: '',
            recipe: '',
            link: ''
          }
        })
      })

      setMeals(mealsByDay)
    } catch (error) {
      console.error('Error loading meal plan:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveMeal = async (e) => {
    e.preventDefault()
    if (!editingMeal) return

    try {
      const { week, day, mealType } = editingMeal

      // Check if meal already exists
      const { data: existingMeal } = await supabase
        .from('meals')
        .select('id')
        .eq('family_id', family.family_id)
        .eq('week_number', week)
        .eq('day_of_week', day)
        .eq('meal_type', mealType)
        .single()

      const mealData = {
        family_id: family.family_id,
        week_number: week,
        day_of_week: day,
        meal_type: mealType,
        name: mealForm.name,
        recipe: mealForm.recipe,
        link: mealForm.link,
        updated_at: new Date().toISOString()
      }

      if (existingMeal) {
        // Update existing meal
        await supabase
          .from('meals')
          .update(mealData)
          .eq('id', existingMeal.id)
      } else {
        // Insert new meal
        await supabase
          .from('meals')
          .insert(mealData)
      }

      // Update local state
      setMeals(prev => ({
        ...prev,
        [day]: {
          ...prev[day],
          [mealType]: {
            name: mealForm.name,
            recipe: mealForm.recipe,
            link: mealForm.link
          }
        }
      }))

      setShowMealModal(false)
      setEditingMeal(null)
      setMealForm({ name: '', recipe: '', link: '' })
    } catch (error) {
      console.error('Error saving meal:', error)
    }
  }

  const addWeek = async () => {
    const nextWeek = Math.max(...availableWeeks) + 1
    setAvailableWeeks([...availableWeeks, nextWeek])
    setCurrentWeek(nextWeek)
    
    // Initialize empty meals for the new week
    const emptyMeals = {}
    daysOfWeek.forEach(day => {
      emptyMeals[day] = {}
      mealTypes.forEach(mealType => {
        emptyMeals[day][mealType] = { name: '', recipe: '', link: '' }
      })
    })
    setMeals(emptyMeals)
  }

  const deleteWeek = async (weekToDelete) => {
    if (availableWeeks.length <= 1) return // Don't delete the last week

    if (confirm(`Are you sure you want to delete Week ${weekToDelete}? This will remove all meals for that week.`)) {
      try {
        await supabase
          .from('meals')
          .delete()
          .eq('family_id', family.family_id)
          .eq('week_number', weekToDelete)

        const newWeeks = availableWeeks.filter(w => w !== weekToDelete)
        setAvailableWeeks(newWeeks)
        
        if (currentWeek === weekToDelete) {
          setCurrentWeek(newWeeks[0])
        }
      } catch (error) {
        console.error('Error deleting week:', error)
      }
    }
  }

  const duplicateWeek = async (sourceWeek) => {
    const nextWeek = Math.max(...availableWeeks) + 1
    
    try {
      // Get all meals from source week
      const { data: sourceMeals } = await supabase
        .from('meals')
        .select('*')
        .eq('family_id', family.family_id)
        .eq('week_number', sourceWeek)

      // Create new meals for next week
      const newMeals = sourceMeals?.map(meal => ({
        family_id: meal.family_id,
        week_number: nextWeek,
        day_of_week: meal.day_of_week,
        meal_type: meal.meal_type,
        name: meal.name,
        recipe: meal.recipe,
        link: meal.link
      })) || []

      if (newMeals.length > 0) {
        await supabase
          .from('meals')
          .insert(newMeals)
      }

      setAvailableWeeks([...availableWeeks, nextWeek])
      setCurrentWeek(nextWeek)
      loadMealPlan()
    } catch (error) {
      console.error('Error duplicating week:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-lg text-gray-600">Loading meal plan...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Weekly Meal Plan</h2>
        <div className="flex space-x-2">
          <button
            onClick={addWeek}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
          >
            ➕ Add Week
          </button>
          <button
            onClick={() => duplicateWeek(currentWeek)}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
          >
            📋 Duplicate Week
          </button>
        </div>
      </div>

      {/* Week Selector */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center space-x-4 overflow-x-auto">
          {availableWeeks.map(weekNum => (
            <div key={weekNum} className="flex items-center space-x-2 whitespace-nowrap">
              <button
                onClick={() => setCurrentWeek(weekNum)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentWeek === weekNum
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Week {weekNum}
              </button>
              {availableWeeks.length > 1 && (
                <button
                  onClick={() => deleteWeek(weekNum)}
                  className="text-red-500 hover:text-red-700 px-2 py-1"
                >
                  🗑️
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Current Week Meals */}
      <div className="grid gap-6">
        {daysOfWeek.map(day => (
          <div key={day} className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 text-blue-600">{day}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {mealTypes.map(mealType => {
                const meal = meals[day]?.[mealType] || { name: '', recipe: '', link: '' }
                return (
                  <div key={mealType} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium text-gray-700 capitalize">{mealType}</h4>
                      <button
                        onClick={() => {
                          setEditingMeal({ week: currentWeek, day, mealType })
                          setMealForm({
                            name: meal.name || '',
                            recipe: meal.recipe || '',
                            link: meal.link || ''
                          })
                          setShowMealModal(true)
                        }}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        ✏️
                      </button>
                    </div>
                    
                    {meal.name ? (
                      <div>
                        <div className="font-medium text-gray-800 mb-2">{meal.name}</div>
                        {meal.recipe && (
                          <div className="text-sm text-gray-600 mb-2 line-clamp-2">
                            <strong>Recipe:</strong> {meal.recipe}
                          </div>
                        )}
                        {meal.link && (
                          <div className="text-sm">
                            <a 
                              href={meal.link} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 underline inline-flex items-center"
                            >
                              🔗 View Recipe
                            </a>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-gray-400 italic">No meal planned</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Meal Modal */}
      {showMealModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                Edit {editingMeal?.day} {editingMeal?.mealType}
              </h3>
              <button
                onClick={() => setShowMealModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={saveMeal} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Meal Name</label>
                <input
                  type="text"
                  value={mealForm.name}
                  onChange={(e) => setMealForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Enter meal name"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Recipe/Notes</label>
                <textarea
                  value={mealForm.recipe}
                  onChange={(e) => setMealForm(prev => ({ ...prev, recipe: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  rows={3}
                  placeholder="Enter recipe details or notes..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Recipe Link</label>
                <input
                  type="url"
                  value={mealForm.link}
                  onChange={(e) => setMealForm(prev => ({ ...prev, link: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="https://example.com/recipe"
                />
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowMealModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
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

export default MealPlan
