import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase.js'

const MealPlan = ({ family }) => {
  const [meals, setMeals] = useState({})
  const [currentWeek, setCurrentWeek] = useState(1)
  const [availableWeeks, setAvailableWeeks] = useState([])
  const [weekNames, setWeekNames] = useState({})
  const [showMealModal, setShowMealModal] = useState(false)
  const [showFavoritesModal, setShowFavoritesModal] = useState(false)
  const [showShoppingListModal, setShowShoppingListModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showWeekNameModal, setShowWeekNameModal] = useState(false)
  const [editingMeal, setEditingMeal] = useState(null)
  const [favoriteRecipes, setFavoriteRecipes] = useState([])
  const [shoppingList, setShoppingList] = useState([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [mealForm, setMealForm] = useState({
    name: '',
    recipe: '',
    link: '',
    ingredients: ''
  })
  const [importForm, setImportForm] = useState({
    url: '',
    name: '',
    ingredients: '',
    recipe: ''
  })
  const [weekNameForm, setWeekNameForm] = useState('')

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const mealTypes = ['breakfast', 'lunch', 'dinner']

  useEffect(() => {
    if (family) {
      loadMealPlan()
      loadFavoriteRecipes()
      loadWeekNames()
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
            link: '',
            ingredients: ''
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

  const loadFavoriteRecipes = async () => {
    try {
      const { data, error } = await supabase
        .from('favorite_recipes')
        .select('*')
        .eq('family_id', family.family_id)
        .order('name', { ascending: true })

      if (error) throw error
      setFavoriteRecipes(data || [])
    } catch (error) {
      console.error('Error loading favorite recipes:', error)
    }
  }

  const loadWeekNames = async () => {
    try {
      const { data, error } = await supabase
        .from('meal_plan_weeks')
        .select('*')
        .eq('family_id', family.family_id)

      if (error) throw error
      
      const namesMap = {}
      data?.forEach(week => {
        namesMap[week.week_number] = week.week_name
      })
      setWeekNames(namesMap)
    } catch (error) {
      console.error('Error loading week names:', error)
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
        ingredients: mealForm.ingredients,
        updated_at: new Date().toISOString()
      }

      if (existingMeal) {
        await supabase
          .from('meals')
          .update(mealData)
          .eq('id', existingMeal.id)
      } else {
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
            link: mealForm.link,
            ingredients: mealForm.ingredients
          }
        }
      }))

      setShowMealModal(false)
      setEditingMeal(null)
      setMealForm({ name: '', recipe: '', link: '', ingredients: '' })
    } catch (error) {
      console.error('Error saving meal:', error)
    }
  }

  const saveFavoriteRecipe = async (recipeData) => {
    try {
      const { data, error } = await supabase
        .from('favorite_recipes')
        .insert({
          family_id: family.family_id,
          name: recipeData.name,
          recipe: recipeData.recipe,
          link: recipeData.link,
          ingredients: recipeData.ingredients
        })
        .select()
        .single()

      if (!error) {
        setFavoriteRecipes([...favoriteRecipes, data])
        alert('Recipe saved to favorites!')
      }
    } catch (error) {
      console.error('Error saving favorite recipe:', error)
    }
  }

  const addFavoriteToMeal = async (favorite) => {
    if (!editingMeal) return

    setMealForm({
      name: favorite.name,
      recipe: favorite.recipe || '',
      link: favorite.link || '',
      ingredients: favorite.ingredients || ''
    })
    setShowFavoritesModal(false)
  }

  const deleteFavoriteRecipe = async (recipeId) => {
    if (confirm('Remove this recipe from favorites?')) {
      try {
        const { error } = await supabase
          .from('favorite_recipes')
          .delete()
          .eq('id', recipeId)

        if (!error) {
          setFavoriteRecipes(favoriteRecipes.filter(r => r.id !== recipeId))
        }
      } catch (error) {
        console.error('Error deleting favorite recipe:', error)
      }
    }
  }

  const generateShoppingList = () => {
    const ingredients = []
    
    Object.keys(meals).forEach(day => {
      Object.keys(meals[day]).forEach(mealType => {
        const meal = meals[day][mealType]
        if (meal.ingredients) {
          // Split ingredients by lines or commas
          const mealIngredients = meal.ingredients
            .split(/[\n,]/)
            .map(item => item.trim())
            .filter(item => item.length > 0)
            .map(item => ({
              item: item.replace(/^\d+\.\s*/, '').replace(/^-\s*/, ''), // Remove bullets/numbers
              source: `${meal.name} (${day} ${mealType})`,
              checked: false
            }))
          
          ingredients.push(...mealIngredients)
        }
      })
    })

    // Remove duplicates and group similar items
    const uniqueIngredients = []
    const seen = new Set()
    
    ingredients.forEach(ingredient => {
      const normalized = ingredient.item.toLowerCase().trim()
      if (!seen.has(normalized)) {
        seen.add(normalized)
        uniqueIngredients.push(ingredient)
      } else {
        // Add source to existing ingredient
        const existing = uniqueIngredients.find(i => i.item.toLowerCase().trim() === normalized)
        if (existing) {
          existing.source += `, ${ingredient.source}`
        }
      }
    })

    setShoppingList(uniqueIngredients)
    setShowShoppingListModal(true)
  }

  const toggleShoppingItem = (index) => {
    setShoppingList(prev => prev.map((item, i) => 
      i === index ? { ...item, checked: !item.checked } : item
    ))
  }

 // Update your importRecipeFromUrl function in MealPlan.jsx with better error handling

const importRecipeFromUrl = async () => {
  if (!importForm.url) {
    alert('Please enter a recipe URL')
    return
  }

  setImporting(true)
  try {
    console.log('🔍 Importing recipe from:', importForm.url)
    
    // Call our Netlify function to parse the recipe
    const response = await fetch('/.netlify/functions/recipe-parser', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: importForm.url
      })
    })

    console.log('📡 Function response status:', response.status)
    console.log('📡 Function response ok:', response.ok)

    // Get the response text first to see what we're getting
    const responseText = await response.text()
    console.log('📄 Raw response:', responseText)

    if (!response.ok) {
      // Try to parse the error response
      let errorData
      try {
        errorData = JSON.parse(responseText)
        console.error('❌ Parsed error data:', errorData)
      } catch (parseError) {
        console.error('❌ Could not parse error response:', responseText)
        throw new Error(`HTTP ${response.status}: ${responseText}`)
      }
      
      // Show more detailed error message
      const errorMessage = errorData.details 
        ? `${errorData.error}: ${errorData.details}`
        : errorData.error || `HTTP ${response.status} error`
      
      throw new Error(errorMessage)
    }

    // Parse successful response
    let result
    try {
      result = JSON.parse(responseText)
      console.log('✅ Parsed success response:', result)
    } catch (parseError) {
      console.error('❌ Could not parse success response:', responseText)
      throw new Error('Invalid response format from server')
    }
    
    if (result.success && result.recipe) {
      const recipe = result.recipe
      console.log('🍳 Recipe data received:', {
        name: recipe.name,
        hasIngredients: !!recipe.ingredients,
        hasInstructions: !!recipe.instructions,
        source: result.source
      })
      
      // Auto-fill the form with parsed data
      setImportForm(prev => ({
        ...prev,
        name: recipe.name || prev.name || extractSiteNameFromUrl(prev.url),
        ingredients: recipe.ingredients || prev.ingredients,
        recipe: formatInstructions(recipe.instructions) || prev.recipe,
        cookTime: recipe.cookTime || '',
        servings: recipe.servings || '',
        author: recipe.author || '',
        description: recipe.description || ''
      }))
      
      // Show success message
      const sourceMsg = result.source === 'structured-data' 
        ? '✅ Recipe auto-parsed successfully from structured data!' 
        : result.source === 'html-parsing'
        ? '✅ Recipe parsed from webpage content!'
        : '✅ Recipe imported!'
      
      alert(sourceMsg + ' Please review and edit as needed.')
      
    } else {
      console.error('❌ Unexpected response format:', result)
      throw new Error('Invalid response format: missing recipe data')
    }
    
  } catch (error) {
    console.error('💥 Recipe import error details:', {
      message: error.message,
      stack: error.stack,
      url: importForm.url
    })
    
    // Show user-friendly error with debugging info
    const errorMessage = error.message.includes('Failed to fetch') 
      ? 'Network error: Could not connect to recipe parser'
      : error.message.includes('timeout')
      ? 'Timeout error: Website took too long to respond'
      : error.message.includes('Dependencies not available')
      ? 'Server error: Recipe parser dependencies not installed'
      : error.message

    // Fallback to manual entry
    const siteName = extractSiteNameFromUrl(importForm.url)
    setImportForm(prev => ({
      ...prev,
      name: prev.name || `Recipe from ${siteName}`,
      recipe: prev.recipe || 'Instructions available at the linked URL.'
    }))
    
    alert(`❌ Could not auto-parse recipe: ${errorMessage}\n\nPlease fill in the details manually.\n\nCheck browser console (F12) for technical details.`)
  } finally {
    setImporting(false)
  }
}

// Helper function to extract site name from URL (add this if not already present)
const extractSiteNameFromUrl = (url) => {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.replace('www.', '')
  } catch {
    return 'Unknown Site'
  }
}

// Helper function to format instructions (add this if not already present)
const formatInstructions = (instructions) => {
  if (!instructions) return ''
  
  // If instructions are already formatted with numbers, return as-is
  if (instructions.match(/^\d+\./m)) {
    return instructions
  }
  
  // Otherwise, split by periods or newlines and add numbers
  const steps = instructions
    .split(/[.\n]/)
    .map(step => step.trim())
    .filter(step => step.length > 10) // Filter out very short fragments
  
  if (steps.length > 1) {
    return steps.map((step, index) => `${index + 1}. ${step}`).join('\n\n')
  }
  
  return instructions
}

// Also add this test function to help debug
const testFunction = async () => {
  try {
    console.log('🧪 Testing function connection...')
    
    const response = await fetch('/.netlify/functions/recipe-parser', {
      method: 'OPTIONS'
    })
    
    console.log('🧪 OPTIONS response:', {
      status: response.status,
      ok: response.ok,
      headers: [...response.headers.entries()]
    })
    
    if (response.ok) {
      console.log('✅ Function is accessible')
    } else {
      console.log('❌ Function not accessible')
    }
  } catch (error) {
    console.error('❌ Function test failed:', error)
  }
}

// You can call testFunction() in browser console to test if function is accessible

  // Helper function to extract site name from URL
const extractSiteNameFromUrl = (url) => {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.replace('www.', '')
  } catch {
    return 'Unknown Site'
  }
}

// Helper function to format instructions
const formatInstructions = (instructions) => {
  if (!instructions) return ''
  
  // If instructions are already formatted with numbers, return as-is
  if (instructions.match(/^\d+\./m)) {
    return instructions
  }
  
  // Otherwise, split by periods or newlines and add numbers
  const steps = instructions
    .split(/[.\n]/)
    .map(step => step.trim())
    .filter(step => step.length > 10) // Filter out very short fragments
  
  if (steps.length > 1) {
    return steps.map((step, index) => `${index + 1}. ${step}`).join('\n\n')
  }
  
  return instructions
}

 // Enhanced save function with additional recipe metadata
const saveImportedRecipe = async () => {
  if (!importForm.name) {
    alert('Please enter a recipe name')
    return
  }

  try {
    const recipeData = {
      name: importForm.name,
      recipe: importForm.recipe,
      link: importForm.url,
      ingredients: importForm.ingredients,
      // Additional metadata (you might want to add these fields to your database)
      cook_time: importForm.cookTime || null,
      servings: importForm.servings || null,
      author: importForm.author || null,
      description: importForm.description || null
    }

    // Save to favorites
    await saveFavoriteRecipe(recipeData)
    
    // If we're editing a meal, add it there too
    if (editingMeal) {
      setMealForm({
        name: recipeData.name,
        recipe: recipeData.recipe,
        link: recipeData.link,
        ingredients: recipeData.ingredients
      })
      setShowImportModal(false)
    } else {
      setShowImportModal(false)
      setImportForm({ 
        url: '', 
        name: '', 
        ingredients: '', 
        recipe: '',
        cookTime: '',
        servings: '',
        author: '',
        description: ''
      })
    }
  } catch (error) {
    console.error('Error saving imported recipe:', error)
    alert('Error saving recipe: ' + error.message)
  }
}

  const saveWeekName = async () => {
    if (!weekNameForm.trim()) return

    try {
      const { error } = await supabase
        .from('meal_plan_weeks')
        .upsert({
          family_id: family.family_id,
          week_number: currentWeek,
          week_name: weekNameForm.trim()
        })

      if (!error) {
        setWeekNames(prev => ({ ...prev, [currentWeek]: weekNameForm.trim() }))
        setShowWeekNameModal(false)
        setWeekNameForm('')
      }
    } catch (error) {
      console.error('Error saving week name:', error)
    }
  }

  const addWeek = async () => {
    const nextWeek = Math.max(...availableWeeks, 0) + 1
    setAvailableWeeks([...availableWeeks, nextWeek])
    setCurrentWeek(nextWeek)
    
    // Initialize empty meals for the new week
    const emptyMeals = {}
    daysOfWeek.forEach(day => {
      emptyMeals[day] = {}
      mealTypes.forEach(mealType => {
        emptyMeals[day][mealType] = { name: '', recipe: '', link: '', ingredients: '' }
      })
    })
    setMeals(emptyMeals)
  }

  const deleteWeek = async (weekToDelete) => {
    if (availableWeeks.length <= 1) return

    if (confirm(`Are you sure you want to delete this week? This will remove all meals for that week.`)) {
      try {
        await supabase
          .from('meals')
          .delete()
          .eq('family_id', family.family_id)
          .eq('week_number', weekToDelete)

        await supabase
          .from('meal_plan_weeks')
          .delete()
          .eq('family_id', family.family_id)
          .eq('week_number', weekToDelete)

        const newWeeks = availableWeeks.filter(w => w !== weekToDelete)
        setAvailableWeeks(newWeeks)
        
        if (currentWeek === weekToDelete) {
          setCurrentWeek(newWeeks[0] || 1)
        }

        // Remove from week names
        const newWeekNames = { ...weekNames }
        delete newWeekNames[weekToDelete]
        setWeekNames(newWeekNames)
      } catch (error) {
        console.error('Error deleting week:', error)
      }
    }
  }

  const duplicateWeek = async (sourceWeek) => {
    const nextWeek = Math.max(...availableWeeks, 0) + 1
    
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
        link: meal.link,
        ingredients: meal.ingredients
      })) || []

      if (newMeals.length > 0) {
        await supabase
          .from('meals')
          .insert(newMeals)
      }

      // Copy week name if it exists
      const sourceWeekName = weekNames[sourceWeek]
      if (sourceWeekName) {
        await supabase
          .from('meal_plan_weeks')
          .insert({
            family_id: family.family_id,
            week_number: nextWeek,
            week_name: `${sourceWeekName} (Copy)`
          })
      }

      setAvailableWeeks([...availableWeeks, nextWeek])
      setCurrentWeek(nextWeek)
      loadMealPlan()
      loadWeekNames()
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
            onClick={() => setShowFavoritesModal(true)}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
          >
            ⭐ Favorites
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700"
          >
            🔗 Import Recipe
          </button>
          <button
            onClick={generateShoppingList}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            🛒 Shopping List
          </button>
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
                {weekNames[weekNum] || `Week ${weekNum}`}
              </button>
              <button
                onClick={() => {
                  setWeekNameForm(weekNames[currentWeek] || '')
                  setShowWeekNameModal(true)
                }}
                className="text-blue-500 hover:text-blue-700 px-2 py-1"
                title="Edit week name"
              >
                ✏️
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
                const meal = meals[day]?.[mealType] || { name: '', recipe: '', link: '', ingredients: '' }
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
                            link: meal.link || '',
                            ingredients: meal.ingredients || ''
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
                        {meal.ingredients && (
                          <div className="text-sm text-gray-600 mb-2">
                            <strong>Ingredients:</strong>
                            <div className="text-xs bg-gray-50 p-2 rounded mt-1 max-h-20 overflow-y-auto">
                              {meal.ingredients.split('\n').map((ingredient, i) => (
                                <div key={i}>{ingredient}</div>
                              ))}
                            </div>
                          </div>
                        )}
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
          <div className="bg-white rounded-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
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
            
            <div className="flex space-x-2 mb-4">
              <button
                onClick={() => setShowFavoritesModal(true)}
                className="bg-purple-100 text-purple-700 px-3 py-1 rounded text-sm hover:bg-purple-200"
              >
                ⭐ Use Favorite
              </button>
              <button
                onClick={() => setShowImportModal(true)}
                className="bg-orange-100 text-orange-700 px-3 py-1 rounded text-sm hover:bg-orange-200"
              >
                🔗 Import Recipe
              </button>
              <button
                onClick={() => {
                  if (mealForm.name) {
                    saveFavoriteRecipe(mealForm)
                  } else {
                    alert('Please enter a meal name first')
                  }
                }}
                className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded text-sm hover:bg-yellow-200"
              >
                💾 Save as Favorite
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Ingredients</label>
                <textarea
                  value={mealForm.ingredients}
                  onChange={(e) => setMealForm(prev => ({ ...prev, ingredients: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  rows={4}
                  placeholder="List ingredients (one per line)..."
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

      {/* Favorites Modal */}
      {showFavoritesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Favorite Recipes</h3>
              <button
                onClick={() => setShowFavoritesModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-3">
              {favoriteRecipes.length === 0 ? (
                <p className="text-gray-500 italic text-center py-8">
                  No favorite recipes yet. Save some recipes to see them here!
                </p>
              ) : (
                favoriteRecipes.map(recipe => (
                  <div key={recipe.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-grow">
                        <h4 className="font-medium text-gray-800">{recipe.name}</h4>
                        {recipe.ingredients && (
                          <p className="text-sm text-gray-600 mt-1">
                            <strong>Ingredients:</strong> {recipe.ingredients.substring(0, 100)}
                            {recipe.ingredients.length > 100 && '...'}
                          </p>
                        )}
                        {recipe.link && (
                          <a 
                            href={recipe.link} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 text-sm"
                          >
                            🔗 View Original
                          </a>
                        )}
                      </div>
                      <div className="flex space-x-2 ml-4">
                        {editingMeal && (
                          <button
                            onClick={() => addFavoriteToMeal(recipe)}
                            className="bg-green-100 text-green-700 px-3 py-1 rounded text-sm hover:bg-green-200"
                          >
                            Use This
                          </button>
                        )}
                        <button
                          onClick={() => deleteFavoriteRecipe(recipe.id)}
                          className="text-red-600 hover:text-red-800"
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
        </div>
      )}

      {/* Shopping List Modal */}
      {showShoppingListModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                Shopping List - {weekNames[currentWeek] || `Week ${currentWeek}`}
              </h3>
              <button
                onClick={() => setShowShoppingListModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-2 mb-4">
              {shoppingList.length === 0 ? (
                <p className="text-gray-500 italic text-center py-8">
                  No ingredients found. Add ingredients to your meals to generate a shopping list.
                </p>
              ) : (
                shoppingList.map((item, index) => (
                  <div 
                    key={index}
                    className={`flex items-start space-x-3 p-2 rounded ${
                      item.checked ? 'bg-green-50 text-green-700' : 'bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => toggleShoppingItem(index)}
                      className="mt-1"
                    />
                    <div className="flex-grow">
                      <div className={`${item.checked ? 'line-through' : ''}`}>
                        {item.item}
                      </div>
                      <div className="text-xs text-gray-500">
                        From: {item.source}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <div className="flex justify-between items-center pt-4 border-t">
              <div className="text-sm text-gray-600">
                {shoppingList.filter(item => item.checked).length} of {shoppingList.length} items checked
              </div>
              <button
                onClick={() => {
                  const text = shoppingList
                    .filter(item => !item.checked)
                    .map(item => `• ${item.item}`)
                    .join('\n')
                  
                  if (navigator.share) {
                    navigator.share({
                      title: 'Shopping List',
                      text: text
                    })
                  } else {
                    navigator.clipboard.writeText(text)
                    alert('Shopping list copied to clipboard!')
                  }
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                📋 Share/Copy List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Recipe Modal */}
     // Updated Import Recipe Modal JSX (replace the existing modal in your component)
{showImportModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Import Recipe from URL</h3>
        <button
          onClick={() => setShowImportModal(false)}
          className="text-gray-400 hover:text-gray-600 text-xl"
        >
          ✕
        </button>
      </div>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Recipe URL</label>
          <div className="flex space-x-2">
            <input
              type="url"
              value={importForm.url}
              onChange={(e) => setImportForm(prev => ({ ...prev, url: e.target.value }))}
              className="flex-grow px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="https://example.com/recipe"
            />
            <button
              onClick={importRecipeFromUrl}
              disabled={importing || !importForm.url}
              className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700 disabled:opacity-50 min-w-[80px]"
            >
              {importing ? (
                <div className="flex items-center space-x-1">
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                  <span>Parsing...</span>
                </div>
              ) : (
                '🔍 Parse'
              )}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Supports most recipe websites including AllRecipes, Food Network, Bon Appétit, and more!
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Recipe Name</label>
            <input
              type="text"
              value={importForm.name}
              onChange={(e) => setImportForm(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Enter recipe name"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Cook Time</label>
              <input
                type="text"
                value={importForm.cookTime || ''}
                onChange={(e) => setImportForm(prev => ({ ...prev, cookTime: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="30 min"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Servings</label>
              <input
                type="text"
                value={importForm.servings || ''}
                onChange={(e) => setImportForm(prev => ({ ...prev, servings: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="4"
              />
            </div>
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Ingredients</label>
          <textarea
            value={importForm.ingredients}
            onChange={(e) => setImportForm(prev => ({ ...prev, ingredients: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            rows={6}
            placeholder="List ingredients (one per line)..."
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Instructions</label>
          <textarea
            value={importForm.recipe}
            onChange={(e) => setImportForm(prev => ({ ...prev, recipe: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            rows={6}
            placeholder="Enter cooking instructions..."
          />
        </div>
        
        {importForm.author && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Author</label>
            <input
              type="text"
              value={importForm.author}
              onChange={(e) => setImportForm(prev => ({ ...prev, author: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Recipe author"
            />
          </div>
        )}
        
        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={() => {
              setShowImportModal(false)
              setImportForm({ 
                url: '', 
                name: '', 
                ingredients: '', 
                recipe: '',
                cookTime: '',
                servings: '',
                author: '',
                description: ''
              })
            }}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={saveImportedRecipe}
            disabled={!importForm.name}
            className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
          >
            💾 Save Recipe
          </button>
        </div>
      </div>
    </div>
  </div>
)}
      {/* Week Name Modal */}
      {showWeekNameModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Name This Week</h3>
              <button
                onClick={() => setShowWeekNameModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Week Name</label>
                <input
                  type="text"
                  value={weekNameForm}
                  onChange={(e) => setWeekNameForm(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Holiday Week, Comfort Foods, Healthy Eating..."
                  onKeyPress={(e) => e.key === 'Enter' && saveWeekName()}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Give this week a memorable name to help organize your meal plans
                </p>
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowWeekNameModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveWeekName}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  💾 Save Name
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MealPlan
