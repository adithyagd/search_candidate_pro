import assert from 'node:assert/strict'
import test from 'node:test'
import { validateSearchParameters } from './search.js'

test('builds a search query from all supported fields', () => {
  const result = validateSearchParameters({
    jobTitle: 'Sales Manager',
    skills: 'CRM, lead generation',
    location: 'Bangalore',
    minExperience: '3',
  })

  assert.deepEqual(result.invalidFields, [])
  assert.equal(
    result.searchQuery,
    'site:linkedin.com/in/ ("Sales Manager") ("CRM" OR "lead generation") Bangalore ("3+ years" OR "3 years")',
  )
})

test('requires a job title and location', () => {
  const result = validateSearchParameters({ skills: 'CRM' })

  assert.deepEqual(result.invalidFields, ['jobTitle', 'location'])
  assert.equal(result.searchQuery, '')
})

test('rejects negative, non-numeric, and blank minimum experience', () => {
  for (const minExperience of ['-1', 'many', '']) {
    const result = validateSearchParameters({
      jobTitle: 'Sales Manager',
      location: 'Bangalore',
      minExperience,
    })

    assert.deepEqual(result.invalidFields, ['minExperience'])
    assert.equal(result.searchQuery, '')
  }
})

test('accepts the legacy experience alias', () => {
  const result = validateSearchParameters({
    jobTitle: 'Sales Manager',
    location: 'Bangalore',
    experience: '3',
  })

  assert.deepEqual(result.invalidFields, [])
  assert.match(result.searchQuery, /"3\+ years"/)
})

test('accepts an explicit query for direct testing', () => {
  const result = validateSearchParameters({ query: 'site:example.com "Sales Manager"' })

  assert.deepEqual(result.invalidFields, [])
  assert.equal(result.searchQuery, 'site:example.com "Sales Manager"')
})

test('escapes embedded quotes in structured input', () => {
  const result = validateSearchParameters({
    jobTitle: 'Sales "Manager"',
    location: 'Bangalore',
  })

  assert.deepEqual(result.invalidFields, [])
  assert.equal(
    result.searchQuery,
    String.raw`site:linkedin.com/in/ ("Sales \"Manager\"") Bangalore`,
  )
})

test('rejects unsupported parameters', () => {
  const result = validateSearchParameters({
    jobTitle: 'Sales Manager',
    location: 'Bangalore',
    department: 'sales',
  })

  assert.deepEqual(result.invalidFields, ['parameters'])
  assert.equal(result.searchQuery, '')
})