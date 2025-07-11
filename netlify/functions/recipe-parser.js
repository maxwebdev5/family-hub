// netlify/functions/recipe-parser.js
// Simplified and more robust version

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  }

  console.log('Recipe parser called:', event.httpMethod)

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

  let url
  try {
    const body = JSON.parse(event.body || '{}')
    url = body.url
    
    if (!url) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'URL is required' })
      }
    }

    console.log('Parsing recipe from:', url)

    // Validate URL
    new URL(url) // This will throw if invalid

    const siteName = getSiteName(url)
    console.log('Site name:', siteName)

    // Try to fetch the webpage with timeout
    console.log('Fetching webpage...')
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000) // 8 second timeout

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FamilyHub-RecipeBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      signal: controller.signal
    })

    clearTimeout(timeoutId)
    console.log('Fetch response status:', response.status)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const html = await response.text()
    console.log('HTML length:', html.length)

    // Parse the recipe
    const recipeData = parseRecipe(html, url, siteName)
    console.log('Parsed recipe:', recipeData.name)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        recipe: recipeData,
        source: recipeData.source,
        debug: {
          siteName: siteName,
          htmlLength: html.length,
          extractedFields: Object.keys(recipeData).filter(key => recipeData[key] && key !== 'source')
        }
      })
    }

  } catch (error) {
    console.error('Recipe parser error:', error.message)
    
    // Return a fallback response instead of throwing
    const siteName = url ? getSiteName(url) : 'Unknown Site'
    
    return {
      statusCode: 200, // Return 200 with fallback data instead of 500 error
      headers,
      body: JSON.stringify({
        success: true,
        recipe: {
          name: `Recipe from ${siteName}`,
          description: `Recipe imported from ${siteName}`,
          ingredients: 'Please add ingredients manually',
          instructions: 'Please add cooking instructions manually. Full recipe available at the linked URL.',
          cookTime: '',
          servings: '',
          author: '',
          siteName: siteName,
          source: 'fallback'
        },
        source: 'fallback',
        message: 'Could not parse recipe automatically. Please add details manually.',
        debug: {
          error: error.message,
          siteName: siteName
        }
      })
    }
  }
}

function getSiteName(url) {
  try {
    const hostname = new URL(url).hostname.replace('www.', '')
    
    // Friendly names for popular sites
    const siteNames = {
      'allrecipes.com': 'AllRecipes',
      'foodnetwork.com': 'Food Network',
      'bonappetit.com': 'Bon Appétit',
      'epicurious.com': 'Epicurious',
      'tasty.co': 'Tasty',
      'food.com': 'Food.com'
    }
    
    return siteNames[hostname] || hostname
  } catch {
    return 'Unknown Site'
  }
}

function parseRecipe(html, url, siteName) {
  try {
    // Try to find JSON-LD structured data first
    const jsonLdData = extractJSONLD(html)
    if (jsonLdData) {
      return {
        ...jsonLdData,
        siteName,
        source: 'structured-data'
      }
    }

    // Fallback to basic HTML parsing
    return {
      name: extractTitle(html) || `Recipe from ${siteName}`,
      description: extractMetaDescription(html) || '',
      ingredients: 'Please add ingredients manually (auto-extraction failed)',
      instructions: 'Please add cooking instructions manually. Full recipe available at the linked URL.',
      cookTime: '',
      servings: '',
      author: '',
      siteName,
      source: 'basic-html'
    }
  } catch (error) {
    console.error('Parse error:', error)
    return {
      name: `Recipe from ${siteName}`,
      description: '',
      ingredients: 'Please add ingredients manually',
      instructions: 'Please add cooking instructions manually',
      cookTime: '',
      servings: '',
      author: '',
      siteName,
      source: 'error-fallback'
    }
  }
}

function extractJSONLD(html) {
  try {
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis
    const matches = html.match(jsonLdRegex)
    
    if (!matches) return null

    for (const match of matches) {
      try {
        const jsonContent = match.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim()
        const data = JSON.parse(jsonContent)
        
        const items = Array.isArray(data) ? data : [data]
        
        for (const item of items) {
          if (item['@type'] === 'Recipe') {
            return {
              name: item.name || '',
              description: item.description || '',
              ingredients: extractIngredients(item.recipeIngredient),
              instructions: extractInstructions(item.recipeInstructions),
              cookTime: formatTime(item.cookTime || item.totalTime) || '',
              servings: item.recipeYield || item.yield || '',
              author: getAuthor(item.author) || ''
            }
          }
        }
      } catch (e) {
        console.log('JSON parse error:', e.message)
        continue
      }
    }
  } catch (error) {
    console.log('JSON-LD extraction failed:', error.message)
  }
  
  return null
}

function extractTitle(html) {
  const patterns = [
    /<title[^>]*>([^<]+)<\/title>/i,
    /<h1[^>]*>([^<]+)<\/h1>/i
  ]
  
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      return match[1].trim().replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    }
  }
  
  return ''
}

function extractMetaDescription(html) {
  const patterns = [
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i
  ]
  
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match && match[1] && match[1].length > 20) {
      return match[1].trim()
    }
  }
  
  return ''
}

function extractIngredients(ingredients) {
  if (!ingredients || !Array.isArray(ingredients)) return ''
  return ingredients.join('\n')
}

function extractInstructions(instructions) {
  if (!instructions || !Array.isArray(instructions)) return ''
  
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
}

function formatTime(timeString) {
  if (!timeString) return ''
  
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

function getAuthor(author) {
  if (!author) return ''
  if (typeof author === 'string') return author
  if (author.name) return author.name
  return ''
}
