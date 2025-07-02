// netlify/functions/recipe-parser.js
// Updated version with better error handling

const https = require('https')
const http = require('http')

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

    // Try to import dependencies with fallback
    let fetch, cheerio
    try {
      fetch = require('node-fetch')
      cheerio = require('cheerio')
      console.log('Dependencies loaded successfully')
    } catch (depError) {
      console.error('Dependency loading error:', depError)
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Dependencies not available',
          details: 'node-fetch or cheerio not installed'
        })
      }
    }

    // Fetch the webpage with timeout and error handling
    let response
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000) // 8 second timeout

      response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RecipeBot/1.0)'
        },
        signal: controller.signal
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
          details: fetchError.message
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
      // Try structured data first
      recipeData = extractStructuredData($) || parseRecipeFromHTML($, url)
      console.log('Recipe extraction completed:', !!recipeData.name)
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
        source: recipeData.source || 'html-parsing'
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
              ingredients: extractIngredients(item.recipeIngredient || []),
              instructions: extractInstructions(item.recipeInstructions || []),
              cookTime: item.cookTime || item.totalTime || '',
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

// Parse recipe from HTML elements
function parseRecipeFromHTML($, url) {
  try {
    const siteName = new URL(url).hostname.replace('www.', '')
    
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
    'meta[name="description"]'
  ]
  
  for (const selector of selectors) {
    try {
      const element = $(selector).first()
      if (element.length) {
        const text = selector === 'meta[name="description"]' 
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
    '.recipe-ingredients li'
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
    '.recipe-instructions li'
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
    '.total-time'
  ]
  
  for (const selector of selectors) {
    try {
      const element = $(selector).first()
      if (element.length) {
        const time = element.attr('datetime') || element.text().trim()
        if (time) return time
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
    '.recipe-yield'
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
    '.author-name'
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
function extractIngredients(ingredients) {
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

function extractInstructions(instructions) {
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
