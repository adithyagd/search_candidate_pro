import dotenv from 'dotenv'
import express from 'express'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { validateSearchParameters } from './search.js'

const serverDirectory = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(serverDirectory, '.env') })

const app = express()
const port = Number(process.env.PORT || 3001)

app.disable('x-powered-by')
app.set('query parser', 'simple')
app.use(express.json({ limit: '10kb' }))

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' })
})

app.get('/api/candidates/search', (request, response) => {
  const result = validateSearchParameters(request.query)

  if (result.invalidFields.length > 0) {
    response.status(400).json({
      error: {
        code: 'INVALID_SEARCH_PARAMETERS',
        message: 'One or more search parameters are invalid.',
        fields: result.invalidFields,
      },
    })
    return
  }

  response.status(501).json({
    error: {
      code: 'SEARCH_PROVIDER_NOT_CONFIGURED',
      message: 'Candidate search provider is not configured.',
    },
    searchQuery: result.searchQuery,
    providerCalled: false,
  })
})

app.use((_request, response) => {
  response.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'The requested endpoint was not found.',
    },
  })
})

app.use((error, _request, response, next) => {
  void next
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
    ? error.status
    : 500

  response.status(status).json({
    error: {
      code: status === 500 ? 'INTERNAL_SERVER_ERROR' : 'INVALID_REQUEST',
      message: status === 500 ? 'An unexpected server error occurred.' : 'The request could not be processed.',
    },
  })
})

app.listen(port, '127.0.0.1', () => {
  console.log(`TalentX-Ray API listening on http://127.0.0.1:${port}`)
})