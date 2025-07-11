// netlify/functions/recipe-parser.js
// Enhanced version with better error handling and dependency management

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  }

  console.log('Function called with method:', event.httpMethod)

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  try {
    const { url } = JSON.parse(event.body || '{}')
    
    if (!url) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'URL is required' })
      }
    }

    console.log('Parsing recipe from:', url)

    // Import dependencies dynamically with fallback
    let fetch, cheerio
    try {
      // Try to import node-fetch (works in Node 18+)
      if (typeof globalThis.fetch === 'undefined') {
        fetch = (await import('node-fetch')).default
      } else {
        fetch = globalThis.fetch
      }
      
      cheerio = (await import('cheerio')).default
      console.log('Dependencies loaded successfully')
    } catch (depError) {
      console.error('Dependency loading error:', depError)
      
      // Fallback: use built-in fetch if available
      if (typeof globalThis.fetch !== 'undefined') {
        fetch = globalThis.fetch
        console.log('Using built-in fetch')
        
        // For parsing without cheerio, we'll do basic text extraction
        return await parseRecipeBasic(url, fetch, headers)
      }
      
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Dependencies not available',
          details: 'Recipe parsing service temporarily unavailable'
        })
      }
    }

    // Fetch the webpage with timeout and error handling
    let response
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000) // 10 second timeout

      response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FamilyHub-RecipeBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        signal: controller.signal,
        follow: 5, // Follow up to 5 redirects
        timeout: 10000
      })
      
      clearTimeout(timeout)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      console.log('Successfully fetched webpage')
    } catch (fetchError) {
      console.error('Fetch error:', fetchError.message)
      
      if (fetchError.name === 'AbortError') {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: 'Request timeout',
            details: 'The website took too long to respond'
          })
        }
      }
      
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Failed to fetch webpage',
          details: fetchError.message,
          suggestion: 'Please check if the URL is correct and the website is accessible'
        })
      }
    }

    // Parse the HTML
    let html, $
    try {
      html = await response.text()
      $ = cheerio.load(html)
      console.log('HTML parsed successfully, length:', html.length)
    } catch (parseError) {
      console.error('HTML parsing error:', parseError)
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Failed to parse webpage',
          details: 'Invalid HTML content'
        })
      }
    }

    // Try to extract recipe data
    let recipeData
    try {
      // Try structured data first (JSON-LD)
      recipeData = extractStructuredData($) || parseRecipeFromHTML($, url)
      console.log('Recipe extraction completed:', !!recipeData.name)
      
      // Enhance with site-specific parsing if needed
      recipeData = enhanceSiteSpecificParsing($, recipeData, url)
      
    } catch (extractError) {
      console.error('Recipe extraction error:', extractError)
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Failed to extract recipe',
          details: extractError.message
        })
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        recipe: recipeData,
        source: recipeData.source || 'html-parsing',
        debug: {
          siteName: getSiteName(url),
          hasStructuredData: recipeData.source === 'structured-data',
          extractedFields: Object.keys(recipeData).filter(key => recipeData[key])
        }
      })
    }

  } catch (error) {
    console.error('Function error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    }
  }
}

// Fallback parser without cheerio for basic extraction
async function parseRecipeBasic(url, fetch, headers) {
  try {
    const response = await fetch(url)
    const html = await response.text()
    
    // Basic text extraction without cheerio
    const siteName = getSiteName(url)
    
    // Look for JSON-LD structured data
    const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis)
    
    if (jsonLdMatch) {
      for (const match of jsonLdMatch) {
        try {
          const jsonContent = match.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '')
          const data = JSON.parse(jsonContent)
          
          if (data['@type'] === 'Recipe' || (Array.isArray(data) && data.some(item => item['@type'] === 'Recipe'))) {
            const recipe = Array.isArray(data) ? data.find(item => item['@type'] === 'Recipe') : data
            
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({
                success: true,
                recipe: {
                  name: recipe.name || `Recipe from ${siteName}`,
                  description: recipe.description || '',
                  ingredients: extractIngredientsFromData(recipe.recipeIngredient || []),
                  instructions: extractInstructionsFromData(recipe.recipeInstructions || []),
                  cookTime: recipe.cookTime || recipe.totalTime || '',
                  servings: recipe.recipeYield || recipe.yield || '',
                  author: recipe.author?.name || recipe.author || '',
                  siteName: siteName,
                  source: 'structured-data-basic'
                }
              })
            }
          }
        } catch (e) {
          continue
        }
      }
    }
    
    // Fallback to basic extraction
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim() : `Recipe from ${siteName}`
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        recipe: {
          name: title,
          description: `Recipe imported from ${siteName}`,
          ingredients: 'Please add ingredients manually',
          instructions: 'Please add instructions manually. Full recipe available at the linked URL.',
          cookTime: '',
          servings: '',
          author: '',
          siteName: siteName,
          source: 'basic-fallback'
        }
      })
    }
    
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Basic parsing failed',
        details: error.message
      })
    }
  }
}

function getSiteName(url) {
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return 'Unknown Site'
  }
}

// Extract recipe from JSON-LD structured data
function extractStructuredData($) {
  try {
    const scripts = $('script[type="application/ld+json"]')
    
    for (let i = 0; i < scripts.length; i++) {
      try {
        const jsonText = $(scripts[i]).html()
        if (!jsonText) continue
        
        const data = JSON.parse(jsonText)
        const items = Array.isArray(data) ? data : [data]
        
        for (const item of items) {
          if (item['@type'] === 'Recipe' || 
              (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))) {
            
            return {
              name: item.name || '',
              description: item.description || '',
              ingredients: extractIngredientsFromData(item.recipeIngredient || []),
              instructions: extractInstructionsFromData(item.recipeInstructions || []),
              cookTime: formatTime(item.cookTime || item.totalTime || ''),
              servings: item.recipeYield || item.yield || '',
              author: item.author?.name || item.author || '',
              source: 'structured-data'
            }
          }
        }
      } catch (e) {
        console.log('JSON-LD parse error:', e.message)
        continue
      }
    }
    
    return null
  } catch (error) {
    console.log('Structured data extraction failed:', error.message)
    return null
  }
}

// Enhanced site-specific parsing
function enhanceSiteSpecificParsing($, recipeData, url) {
  const hostname = getSiteName(url)
  
  // AllRecipes.com specific parsing
  if (hostname.includes('allrecipes.com')) {
    if (!recipeData.ingredients || recipeData.ingredients.length < 10) {
      const ingredients = $('.recipe-ingred_txt').map((i, el) => $(el).text().trim()).get()
      if (ingredients.length > 0) {
        recipeData.ingredients = ingredients.join('\n')
      }
    }
    
    if (!recipeData.instructions || recipeData.instructions.length < 20) {
      const instructions = $('.recipe-directions__list--item').map((i, el) => 
        `${i + 1}. ${$(el).text().trim()}`
      ).get()
      if (instructions.length > 0) {
        recipeData.instructions = instructions.join('\n\n')
      }
    }
  }
  
  // Food Network specific parsing
  else if (hostname.includes('foodnetwork.com')) {
    if (!recipeData.ingredients || recipeData.ingredients.length < 10) {
      const ingredients = $('.o-RecipeIngredient__a-Ingredient').map((i, el) => $(el).text().trim()).get()
      if (ingredients.length > 0) {
        recipeData.ingredients = ingredients.join('\n')
      }
    }
  }
  
  // Bon Appétit specific parsing
  else if (hostname.includes('bonappetit.com')) {
    if (!recipeData.ingredients || recipeData.ingredients.length < 10) {
      const ingredients = $('[data-testid="IngredientList"] li').map((i, el) => $(el).text().trim()).get()
      if (ingredients.length > 0) {
        recipeData.ingredients = ingredients.join('\n')
      }
    }
  }
  
  return recipeData
}

// Parse recipe from HTML elements (fallback)
function parseRecipeFromHTML($, url) {
  try {
    const siteName = getSiteName(url)
    
    return {
      name: extractTitle($) || 'Imported Recipe',
      description: extractDescription($) || '',
      ingredients: extractIngredientsFromHTML($) || '',
      instructions: extractInstructionsFromHTML($) || '',
      cookTime: extractTimeFromHTML($) || '',
      servings: extractServingsFromHTML($) || '',
      author: extractAuthorFromHTML($) || '',
      siteName: siteName,
      source: 'html-parsing'
    }
  } catch (error) {
    console.error('HTML parsing error:', error)
    return {
      name: 'Imported Recipe',
      description: '',
      ingredients: '',
      instructions: '',
      cookTime: '',
      servings: '',
      author: '',
      source: 'fallback'
    }
  }
}

function extractTitle($) {
  const selectors = [
    'h1.recipe-title',
    'h1.entry-title', 
    '.recipe-header h1',
    'h1[itemprop="name"]',
    '[data-testid="recipe-title"]',
    '.recipe-title',
    'h1',
    'title'
  ]
  
  for (const selector of selectors) {
    try {
      const element = $(selector).first()
      if (element.length && element.text().trim()) {
        return element.text().trim()
      }
    } catch (e) {
      continue
    }
  }
  
  return ''
}

function extractDescription($) {
  const selectors = [
    '.recipe-description',
    '.recipe-summary',
    '[itemprop="description"]',
    '[data-testid="recipe-description"]',
    'meta[name="description"]',
    'meta[property="og:description"]'
  ]
  
  for (const selector of selectors) {
    try {
      const element = $(selector).first()
      if (element.length) {
        const text = selector.includes('meta') 
          ? element.attr('content') 
          : element.text().trim()
        
        if (text && text.length > 20) {
          return text
        }
      }
    } catch (e) {
      continue
    }
  }
  
  return ''
}

function extractIngredientsFromHTML($) {
  const selectors = [
    '[itemprop="recipeIngredient"]',
    '.recipe-ingredient',
    '.ingredients li',
    '.recipe-ingredients li',
    '[data-testid="recipe-ingredients"] li',
    '.ingredient-list li'
  ]
  
  for (const selector of selectors) {
    try {
      const elements = $(selector)
      if (elements.length > 0) {
        const ingredients = []
        elements.each((i, el) => {
          const text = $(el).text().trim()
          if (text && !text.match(/^(ingredients|directions)$/i)) {
            ingredients.push(text)
          }
        })
        
        if (ingredients.length > 0) {
          return ingredients.join('\n')
        }
      }
    } catch (e) {
      continue
    }
  }
  
  return ''
}

function extractInstructionsFromHTML($) {
  const selectors = [
    '[itemprop="recipeInstructions"]',
    '.recipe-instruction',
    '.instructions li',
    '.recipe-instructions li',
    '[data-testid="recipe-instructions"] li',
    '.direction-list li'
  ]
  
  for (const selector of selectors) {
    try {
      const elements = $(selector)
      if (elements.length > 0) {
        const instructions = []
        elements.each((i, el) => {
          const text = $(el).text().trim()
          if (text && !text.match(/^(ingredients|directions)$/i)) {
            instructions.push(`${i + 1}. ${text}`)
          }
        })
        
        if (instructions.length > 0) {
          return instructions.join('\n\n')
        }
      }
    } catch (e) {
      continue
    }
  }
  
  return ''
}

function extractTimeFromHTML($) {
  const selectors = [
    '[itemprop="cookTime"]',
    '[itemprop="totalTime"]',
    '.cook-time',
    '.total-time',
    '[data-testid="cook-time"]'
  ]
  
  for (const selector of selectors) {
    try {
      const element = $(selector).first()
      if (element.length) {
        const time = element.attr('datetime') || element.text().trim()
        if (time) return formatTime(time)
      }
    } catch (e) {
      continue
    }
  }
  
  return ''
}

function extractServingsFromHTML($) {
  const selectors = [
    '[itemprop="recipeYield"]',
    '.servings',
    '.recipe-yield',
    '[data-testid="servings"]'
  ]
  
  for (const selector of selectors) {
    try {
      const element = $(selector).first()
      if (element.length) {
        const servings = element.text().trim().match(/\d+/)
        if (servings) return servings[0]
      }
    } catch (e) {
      continue
    }
  }
  
  return ''
}

function extractAuthorFromHTML($) {
  const selectors = [
    '[itemprop="author"]',
    '.recipe-author',
    '.author-name',
    '[data-testid="author"]'
  ]
  
  for (const selector of selectors) {
    try {
      const element = $(selector).first()
      if (element.length) {
        return element.text().trim()
      }
    } catch (e) {
      continue
    }
  }
  
  return ''
}

// Helper functions for structured data
function extractIngredientsFromData(ingredients) {
  if (!Array.isArray(ingredients)) return ''
  try {
    return ingredients
      .map(ing => typeof ing === 'string' ? ing : (ing.text || ''))
      .filter(Boolean)
      .join('\n')
  } catch (e) {
    return ''
  }
}

function extractInstructionsFromData(instructions) {
  if (!Array.isArray(instructions)) return ''
  
  try {
    return instructions
      .map((inst, index) => {
        let text = ''
        if (typeof inst === 'string') {
          text = inst
        } else if (inst.text) {
          text = inst.text
        } else if (inst.name) {
          text = inst.name
        }
        
        return text ? `${index + 1}. ${text}` : ''
      })
      .filter(Boolean)
      .join('\n\n')
  } catch (e) {
    return ''
  }
}

function formatTime(timeString) {
  if (!timeString) return ''
  
  // Handle ISO 8601 duration format (PT30M)
  if (timeString.match(/^PT/)) {
    const hours = timeString.match(/(\d+)H/)
    const minutes = timeString.match(/(\d+)M/)
    
    let result = ''
    if (hours) result += `${hours[1]} hours `
    if (minutes) result += `${minutes[1]} minutes`
    
    return result.trim()
  }
  
  return timeString
}
