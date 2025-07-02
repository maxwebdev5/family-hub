// netlify/functions/recipe-parser.js
// This function handles recipe parsing from URLs

const fetch = require('node-fetch')
const cheerio = require('cheerio')

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
    const { url } = JSON.parse(event.body)
    
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    // Try to extract structured data (JSON-LD) first
    const structuredData = extractStructuredData($)
    if (structuredData) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          recipe: structuredData,
          source: 'structured-data'
        })
      }
    }

    // Fall back to HTML parsing
    const parsedRecipe = parseRecipeFromHTML($, url)
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        recipe: parsedRecipe,
        source: 'html-parsing'
      })
    }

  } catch (error) {
    console.error('Recipe parsing error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to parse recipe',
        details: error.message
      })
    }
  }
}

// Extract recipe from JSON-LD structured data
function extractStructuredData($) {
  try {
    const scripts = $('script[type="application/ld+json"]')
    
    for (let i = 0; i < scripts.length; i++) {
      try {
        const jsonText = $(scripts[i]).html()
        const data = JSON.parse(jsonText)
        
        // Handle arrays of structured data
        const items = Array.isArray(data) ? data : [data]
        
        for (const item of items) {
          if (item['@type'] === 'Recipe' || 
              (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))) {
            
            return {
              name: item.name || '',
              description: item.description || '',
              ingredients: extractIngredients(item.recipeIngredient || []),
              instructions: extractInstructions(item.recipeInstructions || []),
              cookTime: item.cookTime || item.totalTime || '',
              servings: item.recipeYield || item.yield || '',
              author: item.author?.name || item.author || '',
              image: extractImage(item.image),
              nutrition: extractNutrition(item.nutrition)
            }
          }
        }
      } catch (e) {
        console.log('Failed to parse JSON-LD:', e.message)
        continue
      }
    }
    
    return null
  } catch (error) {
    console.log('No structured data found')
    return null
  }
}

// Parse recipe from HTML elements
function parseRecipeFromHTML($, url) {
  const siteName = new URL(url).hostname.replace('www.', '')
  
  return {
    name: extractTitle($),
    description: extractDescription($),
    ingredients: extractIngredientsFromHTML($),
    instructions: extractInstructionsFromHTML($),
    cookTime: extractTimeFromHTML($),
    servings: extractServingsFromHTML($),
    author: extractAuthorFromHTML($),
    image: extractImageFromHTML($, url),
    siteName: siteName
  }
}

function extractTitle($) {
  // Try various selectors for recipe titles
  const selectors = [
    'h1.recipe-title',
    'h1.entry-title',
    '.recipe-header h1',
    '.recipe-title',
    'h1[itemprop="name"]',
    'h1',
    'title'
  ]
  
  for (const selector of selectors) {
    const element = $(selector).first()
    if (element.length && element.text().trim()) {
      return element.text().trim()
    }
  }
  
  return 'Imported Recipe'
}

function extractDescription($) {
  const selectors = [
    '.recipe-description',
    '.recipe-summary',
    '[itemprop="description"]',
    '.entry-content p:first-of-type',
    'meta[name="description"]'
  ]
  
  for (const selector of selectors) {
    const element = $(selector).first()
    if (element.length) {
      const text = selector === 'meta[name="description"]' 
        ? element.attr('content') 
        : element.text().trim()
      
      if (text && text.length > 20) {
        return text
      }
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
    '.ingredient-list li',
    '.ingredients-section li'
  ]
  
  for (const selector of selectors) {
    const elements = $(selector)
    if (elements.length > 0) {
      const ingredients = []
      elements.each((i, el) => {
        const text = $(el).text().trim()
        if (text && !text.match(/^(ingredients|directions|instructions)$/i)) {
          ingredients.push(text)
        }
      })
      
      if (ingredients.length > 0) {
        return ingredients.join('\n')
      }
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
    '.directions li',
    '.method li',
    '.recipe-directions li'
  ]
  
  for (const selector of selectors) {
    const elements = $(selector)
    if (elements.length > 0) {
      const instructions = []
      elements.each((i, el) => {
        const text = $(el).text().trim()
        if (text && !text.match(/^(ingredients|directions|instructions)$/i)) {
          instructions.push(`${i + 1}. ${text}`)
        }
      })
      
      if (instructions.length > 0) {
        return instructions.join('\n\n')
      }
    }
  }
  
  return ''
}

function extractTimeFromHTML($) {
  const selectors = [
    '[itemprop="cookTime"]',
    '[itemprop="totalTime"]',
    '.cook-time',
    '.prep-time',
    '.total-time'
  ]
  
  for (const selector of selectors) {
    const element = $(selector).first()
    if (element.length) {
      const time = element.attr('datetime') || element.text().trim()
      if (time) return time
    }
  }
  
  return ''
}

function extractServingsFromHTML($) {
  const selectors = [
    '[itemprop="recipeYield"]',
    '.servings',
    '.recipe-yield',
    '.serves'
  ]
  
  for (const selector of selectors) {
    const element = $(selector).first()
    if (element.length) {
      const servings = element.text().trim().match(/\d+/)
      if (servings) return servings[0]
    }
  }
  
  return ''
}

function extractAuthorFromHTML($) {
  const selectors = [
    '[itemprop="author"]',
    '.recipe-author',
    '.author-name',
    '.by-author'
  ]
  
  for (const selector of selectors) {
    const element = $(selector).first()
    if (element.length) {
      return element.text().trim()
    }
  }
  
  return ''
}

function extractImageFromHTML($, url) {
  const selectors = [
    '[itemprop="image"]',
    '.recipe-image img',
    '.recipe-photo img',
    'meta[property="og:image"]'
  ]
  
  for (const selector of selectors) {
    const element = $(selector).first()
    if (element.length) {
      let imgUrl = element.attr('src') || element.attr('content')
      if (imgUrl) {
        // Convert relative URLs to absolute
        if (imgUrl.startsWith('/')) {
          const urlObj = new URL(url)
          imgUrl = `${urlObj.protocol}//${urlObj.host}${imgUrl}`
        }
        return imgUrl
      }
    }
  }
  
  return ''
}

// Helper functions for structured data
function extractIngredients(ingredients) {
  if (!Array.isArray(ingredients)) return ''
  return ingredients.map(ing => typeof ing === 'string' ? ing : ing.text || '').join('\n')
}

function extractInstructions(instructions) {
  if (!Array.isArray(instructions)) return ''
  
  return instructions.map((inst, index) => {
    let text = ''
    if (typeof inst === 'string') {
      text = inst
    } else if (inst.text) {
      text = inst.text
    } else if (inst.name) {
      text = inst.name
    }
    
    return text ? `${index + 1}. ${text}` : ''
  }).filter(Boolean).join('\n\n')
}

function extractImage(image) {
  if (!image) return ''
  if (typeof image === 'string') return image
  if (Array.isArray(image)) return image[0]?.url || image[0] || ''
  return image.url || ''
}

function extractNutrition(nutrition) {
  if (!nutrition) return null
  
  return {
    calories: nutrition.calories,
    protein: nutrition.proteinContent,
    carbs: nutrition.carbohydrateContent,
    fat: nutrition.fatContent,
    fiber: nutrition.fiberContent,
    sugar: nutrition.sugarContent
  }
}
