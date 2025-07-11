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

  // Helper functions
  const extractSiteNameFromUrl = (url) => {
    try {
      const urlObj = new URL(url)
      return urlObj.hostname.replace('www.', '')
    } catch {
      return 'Unknown Site'
    }
  }

useEffect(() => {
  if (family?.family_id) {
    loadMealPlan()
    loadFavoriteRecipes()
    loadWeekNames()
  }
}, [family?.family_id])  // ← Fixed: removed currentWeek

  const loadMealPlan = async () => {
    try {
      const { data: mealsData, error } = await supabase
        .from('meals')
        .select('*')
        .eq('family_id', family.family_id)
        .eq('week_number', currentWeek)

      if (error) throw error

      const { data: weeksData } = await supabase
        .from('meals')
        .select('week_number')
        .eq('family_id', family.family_id)

      const weeks = [...new Set(weeksData?.map(m => m.week_number) || [1])]
      setAvailableWeeks(weeks.sort((a, b) => a - b))

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
          const mealIngredients = meal.ingredients
            .split(/[\n,]/)
            .map(item => item.trim())
            .filter(item => item.length > 0)
            .map(item => ({
              item: item.replace(/^\d+\.\s*/, '').replace(/^-\s*/, ''),
              source: `${meal.name} (${day} ${mealType})`,
              checked: false
            }))
          
          ingredients.push(...mealIngredients)
        }
      })
    })

    const uniqueIngredients = []
    const seen = new Set()
    
    ingredients.forEach(ingredient => {
      const normalized = ingredient.item.toLowerCase().trim()
      if (!seen.has(normalized)) {
        seen.add(normalized)
        uniqueIngredients.push(ingredient)
      } else {
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

// Replace ONLY the importRecipeFromUrl function in your MealPlan.jsx
// Don't add the extractSiteNameFromUrl function since you already have it

const importRecipeFromUrl = async () => {
  if (!importForm.url.trim()) {
    alert('Please enter a recipe URL')
    return
  }

  // Validate URL format
  try {
    new URL(importForm.url)
  } catch {
    alert('Please enter a valid URL (e.g., https://example.com/recipe)')
    return
  }

  setImporting(true)
  
  try {
    console.log('Importing recipe from:', importForm.url)

    const response = await fetch('/.netlify/functions/recipe-parser', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: importForm.url.trim()
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `Server error: ${response.status}`)
    }

    const result = await response.json()
    console.log('Recipe import result:', result)

    if (!result.success) {
      throw new Error(result.error || 'Failed to parse recipe')
    }

    const recipe = result.recipe
    const siteName = recipe.siteName || extractSiteNameFromUrl(importForm.url)

    // Update the form with parsed data
    setImportForm(prev => ({
      ...prev,
      name: recipe.name || `Recipe from ${siteName}`,
      ingredients: recipe.ingredients || 'Please add ingredients manually.',
      recipe: recipe.instructions || 'Please add cooking instructions manually. Recipe available at the linked URL.'
    }))

    // Show success message
    let successMessage = '✅ Recipe imported successfully!'
    
    if (result.source === 'structured-data') {
      successMessage += '\n🎯 Found structured recipe data - all details imported!'
    } else if (result.source === 'html-parsing') {
      successMessage += '\n📝 Imported from website content'
    } else {
      successMessage += '\n⚠️ Limited data extracted - please review and edit'
    }

    alert(successMessage)

  } catch (error) {
    console.error('Recipe import error:', error)
    
    // Provide helpful error messages
    let errorMessage = 'Failed to import recipe: ' + error.message
    
    if (error.message.includes('timeout') || error.message.includes('took too long')) {
      errorMessage += '\n\nThe website took too long to respond. Please try again.'
    } else if (error.message.includes('fetch')) {
      errorMessage += '\n\nCould not access the website. Please check the URL and try again.'
    }
  }
// Enhanced helper function for better URL validation
const extractSiteNameFromUrl = (url) => {
  try {
    const urlObj = new URL(url)
    let hostname = urlObj.hostname.replace('www.', '')
    
    // Make it more readable for common sites
    const siteNames = {
      'allrecipes.com': 'AllRecipes',
      'foodnetwork.com': 'Food Network',
      'bonappetit.com': 'Bon Appétit',
      'epicurious.com': 'Epicurious',
      'tasty.co': 'Tasty',
      'food.com': 'Food.com',
      'delish.com': 'Delish',
      'eatingwell.com': 'EatingWell',
      'tasteofhome.com': 'Taste of Home',
      'thekitchn.com': 'The Kitchn'
    }
    
    return siteNames[hostname] || hostname
  } catch {
    return 'Unknown Site'
  }

// Enhanced UI feedback component (optional addition to your modal)
const RecipeImportProgress = ({ importing, message }) => {
  if (!importing) return null
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">🔄</div>
          <h3 className="text-lg font-semibold mb-2">Importing Recipe</h3>
          <p className="text-gray-600">{message || 'Please wait while we fetch the recipe...'}</p>
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{width: '60%'}}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

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
        ingredients: importForm.ingredients
      }

      await saveFavoriteRecipe(recipeData)
      
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
        setImportForm({ url: '', name: '', ingredients: '', recipe: '' })
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
  console.log('🚀 Starting addWeek function')
  
  try {
    // Log current state
    console.log('Current state:', {
      availableWeeks,
      currentWeek,
      family: family?.family_id
    })
    
    // Check if we have required data
    if (!family?.family_id) {
      throw new Error('No family data available')
    }
    
    // Safely calculate next week
    let nextWeek
    if (!availableWeeks || availableWeeks.length === 0) {
      console.log('No available weeks, starting with week 1')
      nextWeek = 1
    } else {
      nextWeek = Math.max(...availableWeeks) + 1
      console.log('Calculated next week:', nextWeek)
    }
    
    // Update availableWeeks state
    console.log('Updating availableWeeks state...')
    const newAvailableWeeks = [...(availableWeeks || []), nextWeek]
    setAvailableWeeks(newAvailableWeeks)
    console.log('New availableWeeks:', newAvailableWeeks)
    
    // Update current week
    console.log('Setting current week to:', nextWeek)
    setCurrentWeek(nextWeek)
    
    // Create empty meals structure
    console.log('Creating empty meals structure...')
    const emptyMeals = {}
    
    if (!daysOfWeek || !Array.isArray(daysOfWeek)) {
      throw new Error('daysOfWeek is not defined or not an array')
    }
    
    if (!mealTypes || !Array.isArray(mealTypes)) {
      throw new Error('mealTypes is not defined or not an array')
    }
    
    daysOfWeek.forEach(day => {
      emptyMeals[day] = {}
      mealTypes.forEach(mealType => {
        emptyMeals[day][mealType] = { 
          name: '', 
          recipe: '', 
          link: '', 
          ingredients: '' 
        }
      })
    })
    
    console.log('Empty meals structure created:', Object.keys(emptyMeals))
    
    // Update meals state
    console.log('Setting meals state...')
    setMeals(emptyMeals)
    
    console.log('✅ addWeek completed successfully!')
    
  } catch (error) {
    console.error('❌ ERROR in addWeek:', error)
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      availableWeeks,
      daysOfWeek,
      mealTypes
    })
    
    // Show user-friendly error
    alert(`Failed to add week: ${error.message}`)
  }
}

  const deleteWeek = async (weekToDelete) => {
    if (availableWeeks.length <= 1) return

    if (confirm('Are you sure you want to delete this week? This will remove all meals for that week.')) {
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
      const { data: sourceMeals } = await supabase
        .from('meals')
        .select('*')
        .eq('family_id', family.family_id)
        .eq('week_number', sourceWeek)

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
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
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
                    className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700 disabled:opacity-50"
                  >
                    {importing ? 'Importing...' : '🔗 Import'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Enter a recipe URL and click Import to auto-fill the form
                </p>
              </div>
              
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
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Ingredients</label>
                <textarea
                  value={importForm.ingredients}
                  onChange={(e) => setImportForm(prev => ({ ...prev, ingredients: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  rows={4}
                  placeholder="List ingredients (one per line)..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Instructions</label>
                <textarea
                  value={importForm.recipe}
                  onChange={(e) => setImportForm(prev => ({ ...prev, recipe: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  rows={4}
                  placeholder="Enter cooking instructions..."
                />
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowImportModal(false)
                    setImportForm({ url: '', name: '', ingredients: '', recipe: '' })
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
