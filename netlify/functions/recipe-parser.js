// netlify/functions/recipe-parser.js
// Simplified version that works without additional dependencies

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  }

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

    // Fetch the webpage
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FamilyHub-RecipeBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const html = await response.text()
    console.log('HTML fetched, length:', html.length)

    // Extract recipe data using regex and basic parsing
    const recipeData = await parseRecipeFromHTML(html, url)
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        recipe: recipeData,
        source: recipeData.source
      })
    }

  } catch (error) {
    console.error('Function error:', error)
    
    // Fallback response
    const siteName = getSiteName(url)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        recipe: {
          name: `Recipe from ${siteName}`,
          description: `Recipe imported from ${siteName}`,
          ingredients: 'Please add ingredients manually',
          instructions: 'Please add instructions manually. Full recipe available at the linked URL.',
          cookTime: '',
          servings: '',
          author: '',
          siteName: siteName,
          source: 'fallback'
        },
        message: 'Recipe URL imported. Please fill in details manually.'
      })
    }
  }
}

async function parseRecipeFromHTML(html, url) {
  const siteName = getSiteName(url)
  
  try {
    // Look for JSON-LD structured data first
    const structuredData = extractJSONLD(html)
    if (structuredData) {
      return {
        ...structuredData,
        siteName,
        source: 'structured-data'
      }
    }

    // Fallback to basic HTML parsing
    return {
      name: extractTitle(html) || `Recipe from ${siteName}`,
      description: extractMetaDescription(html) || '',
      ingredients: extractTextBetweenMarkers(html, ['ingredient', 'recipe-ingredient']) || 'Please add ingredients manually',
      instructions: extractTextBetweenMarkers(html, ['instruction', 'recipe-instruction', 'direction']) || 'Please add instructions manually',
      cookTime: extractTime(html) || '',
      servings: extractServings(html) || '',
      author: extractAuthor(html) || '',
      siteName,
      source: 'html-parsing'
    }
  } catch (error) {
    console.error('Parsing error:', error)
    return {
      name: `Recipe from ${siteName}`,
      description: '',
      ingredients: 'Please add ingredients manually',
      instructions: 'Please add instructions manually. Full recipe available at the linked URL.',
      cookTime: '',
      servings: '',
      author: '',
      siteName,
      source: 'basic-fallback'
    }
  }
}

function extractJSONLD(html) {
  try {
    // Find JSON-LD script tags
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis
    const matches = html.match(jsonLdRegex)
    
    if (!matches) return null

    for (const match of matches) {
      try {
        const jsonContent = match.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim()
        const data = JSON.parse(jsonContent)
        
        // Handle both single objects and arrays
        const items = Array.isArray(data) ? data : [data]
        
        for (const item of items) {
          if (item['@type'] === 'Recipe') {
            return {
              name: item.name || '',
              description: item.description || '',
              ingredients: Array.isArray(item.recipeIngredient) 
                ? item.recipeIngredient.join('\n') 
                : '',
              instructions: formatInstructions(item.recipeInstructions) || '',
              cookTime: formatTime(item.cookTime || item.totalTime) || '',
              servings: item.recipeYield || item.yield || '',
              author: typeof item.author === 'object' ? item.author.name : item.author || ''
            }
          }
        }
      } catch (e) {
        console.log('JSON parsing error:', e.message)
        continue
      }
    }
  } catch (error) {
    console.log('JSON-LD extraction failed:', error.message)
  }
  
  return null
}

function extractTitle(html) {
  // Try various title patterns
  const patterns = [
    /<h1[^>]*class[^>]*recipe[^>]*>([^<]+)<\/h1>/i,
    /<h1[^>]*>([^<]+)<\/h1>/i,
    /<title[^>]*>([^<]+)<\/title>/i
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

function extractTextBetweenMarkers(html, keywords) {
  for (const keyword of keywords) {
    // Look for lists or divs with keyword in class name
    const pattern = new RegExp(`<[^>]*class[^>]*${keyword}[^>]*>([\\s\\S]*?)<\/[^>]+>`, 'gi')
    const matches = html.match(pattern)
    
    if (matches) {
      const items = []
      for (const match of matches) {
        // Extract text content from list items or paragraphs
        const listItems = match.match(/<li[^>]*>([^<]+)<\/li>/gi)
        if (listItems) {
          listItems.forEach(item => {
            const text = item.replace(/<[^>]+>/g, '').trim()
            if (text && text.length > 3) {
              items.push(text)
            }
          })
        }
      }
      
      if (items.length > 0) {
        return items.join('\n')
      }
    }
  }
  
  return ''
}

function extractTime(html) {
  const patterns = [
    /<time[^>]*datetime=["']([^"']+)["']/i,
    /(?:cook|prep|total)[^>]*time[^>]*>([^<]+)</i
  ]
  
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      return formatTime(match[1].trim())
    }
  }
  
  return ''
}

function extractServings(html) {
  const patterns = [
    /(?:serves?|servings?|yield)[^>]*>([^<]+)</i,
    /(\d+)\s*(?:servings?|portions?)/i
  ]
  
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      const num = match[1].match(/\d+/)
      if (num) return num[0]
    }
  }
  
  return ''
}

function extractAuthor(html) {
  const patterns = [
    /<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i,
    /(?:by|recipe by|author)[^>]*>([^<]+)</i
  ]
  
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    }
  }
  
  return ''
}

function formatInstructions(instructions) {
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
  
  // Handle ISO 8601 duration (PT30M)
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

function getSiteName(url) {
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return 'Unknown Site'
  }
}
