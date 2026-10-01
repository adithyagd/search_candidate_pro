const allowedSearchParameters = new Set([
  'jobTitle',
  'skills',
  'location',
  'minExperience',
  'experience',
  'query',
])
function escapeSearchTerm(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

function hasControlCharacters(value) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 0x1f || code === 0x7f
  })
}

function validateText(value, field, maxLength, invalidFields, required = false) {
  if (value === undefined && !required) return ''

  if (
    typeof value !== 'string' ||
    value.trim().length > maxLength ||
    hasControlCharacters(value) ||
    (required && !value.trim())
  ) {
    invalidFields.push(field)
    return ''
  }

  return value.trim()
}

function buildStructuredSearchQuery({ jobTitle, skills, location, minExperience }) {
  const queryParts = [
    'site:linkedin.com/in/',
    `("${escapeSearchTerm(jobTitle)}")`,
  ]
  const skillTerms = skills
    .split(',')
    .map((skill) => skill.trim())
    .filter(Boolean)

  if (skillTerms.length > 0) {
    queryParts.push(
      `(${skillTerms.map((skill) => `"${escapeSearchTerm(skill)}"`).join(' OR ')})`,
    )
  }

  queryParts.push(/\s/.test(location)
    ? `"${escapeSearchTerm(location)}"`
    : escapeSearchTerm(location))

  if (minExperience !== undefined) {
    const years = String(Number(minExperience))
    queryParts.push(`("${years}+ years" OR "${years} years")`)
  }

  return queryParts.join(' ')
}

export function validateSearchParameters(parameters) {
  const invalidFields = []
  const unknownParameters = Object.keys(parameters).some(
    (parameter) => !allowedSearchParameters.has(parameter),
  )

  if (unknownParameters) invalidFields.push('parameters')

  if (parameters.query !== undefined) {
    if (Object.keys(parameters).some((parameter) => parameter !== 'query')) {
      invalidFields.push('query')
    }

    const searchQuery = validateText(parameters.query, 'query', 1000, invalidFields, true)
    return { invalidFields: [...new Set(invalidFields)], searchQuery }
  }

  const jobTitle = validateText(parameters.jobTitle, 'jobTitle', 120, invalidFields, true)
  const skills = validateText(parameters.skills, 'skills', 500, invalidFields)
  const location = validateText(parameters.location, 'location', 120, invalidFields, true)
  const experienceValue = parameters.minExperience ?? parameters.experience
  let minExperience

  if (parameters.minExperience !== undefined && parameters.experience !== undefined) {
    invalidFields.push('minExperience')
  } else if (experienceValue !== undefined) {
    const experienceInput = validateText(experienceValue, 'minExperience', 32, invalidFields, true)
    const experience = Number(experienceInput)

    if (!Number.isFinite(experience) || experience < 0) {
      invalidFields.push('minExperience')
    } else {
      minExperience = experienceInput
    }
  }

  const searchQuery = invalidFields.length > 0
    ? ''
    : buildStructuredSearchQuery({ jobTitle, skills, location, minExperience })

  return { invalidFields: [...new Set(invalidFields)], searchQuery }
}