import { useEffect, useId, useRef, useState } from 'react'
import './App.css'

const GOOGLE_SEARCH_ENGINE_ID = '64a5934e4ed5142db'
const GOOGLE_SEARCH_SCRIPT_ID = 'talentxray-google-search-script'
const GOOGLE_RESULT_TIMEOUT = 20000

let googleScriptPromise
let googleResultsElement
let activeGoogleResultsHandler

function getGoogleSearchApi() {
  return window.google?.search?.cse?.element
}

function handleGoogleResultsReady(elementName, query, _promotions, results) {
  activeGoogleResultsHandler?.(elementName, query, results)
}

function loadGoogleSearchApi() {
  const loadedApi = getGoogleSearchApi()
  if (loadedApi) return Promise.resolve(loadedApi)
  if (googleScriptPromise) return googleScriptPromise

  const existingConfig = window.__gcse || {}
  const existingCallbacks = existingConfig.searchCallbacks || {}
  window.__gcse = {
    ...existingConfig,
    parsetags: 'explicit',
    searchCallbacks: {
      ...existingCallbacks,
      web: {
        ...existingCallbacks.web,
        ready: handleGoogleResultsReady,
      },
    },
  }

  googleScriptPromise = new Promise((resolve, reject) => {
    let timeoutId
    let apiPollId
    const script = document.getElementById(GOOGLE_SEARCH_SCRIPT_ID)
      || document.createElement('script')

    const finish = (error, api = getGoogleSearchApi()) => {
      window.clearTimeout(timeoutId)
      window.clearTimeout(apiPollId)
      script.removeEventListener('load', handleLoad)
      script.removeEventListener('error', handleError)
      if (error) reject(error)
      else resolve(api)
    }

    const handleLoad = () => {
      const waitForApi = () => {
        const api = getGoogleSearchApi()
        if (api) finish(undefined, api)
        else apiPollId = window.setTimeout(waitForApi, 50)
      }

      waitForApi()
    }
    const handleError = () => finish(new Error('Google Search Element script failed to load.'))

    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', handleError, { once: true })
    timeoutId = window.setTimeout(
      () => finish(new Error('Google Search Element script timed out.')),
      GOOGLE_RESULT_TIMEOUT,
    )

    if (!script.id) {
      script.id = GOOGLE_SEARCH_SCRIPT_ID
      script.async = true
      script.src = `https://cse.google.com/cse.js?cx=${encodeURIComponent(GOOGLE_SEARCH_ENGINE_ID)}`
      document.head.appendChild(script)
    }
  }).catch((error) => {
    googleScriptPromise = undefined
    document.getElementById(GOOGLE_SEARCH_SCRIPT_ID)?.remove()
    throw error
  })

  return googleScriptPromise
}

function GoogleSearchResults({ query }) {
  const reactId = useId().replaceAll(':', '')
  const containerId = `talentxray-google-results-${reactId}`
  const elementRef = useRef(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (!query) return undefined

    let active = true
    let resultTimeoutId
    const reportResults = (elementName, resultQuery, results) => {
      if (!active || elementName !== googleResultsElement?.gname || resultQuery !== query) return

      window.clearTimeout(resultTimeoutId)
      if (Array.isArray(results) && results.length > 0) {
        setStatus('Google returned results. They are displayed below.')
      } else if (Array.isArray(results)) {
        setStatus('Google returned no results for this search.')
      } else {
        setStatus('Google did not return a usable response. Check the search engine configuration.')
      }
    }

    activeGoogleResultsHandler = reportResults
    Promise.resolve().then(() => {
      if (active) setStatus('Search submitted. Loading Google results...')
    })
    resultTimeoutId = window.setTimeout(() => {
      if (active) {
        setStatus('Search submitted. Google has not confirmed completion yet.')
      }
    }, GOOGLE_RESULT_TIMEOUT)

    loadGoogleSearchApi()
      .then((api) => {
        if (!active) return

        let element = elementRef.current || googleResultsElement
        if (!element) {
          element = Object.values(api.getAllElements()).find(
            (searchElement) => searchElement.type === 'searchresults-only',
          )
        }
        if (!element) {
          api.render({ div: containerId, tag: 'searchresults-only' })
          element = Object.values(api.getAllElements()).find(
            (searchElement) => searchElement.type === 'searchresults-only',
          )
        }
        if (!element || typeof element.execute !== 'function') {
          throw new Error('Google Search Element could not be initialized.')
        }

        elementRef.current = element
        googleResultsElement = element
        element.execute(query)
      })
      .catch(() => {
        if (!active) return
        window.clearTimeout(resultTimeoutId)
          setStatus('Google search interface unavailable. Check the engine ID and network connection.')
      })

    return () => {
      active = false
      window.clearTimeout(resultTimeoutId)
      if (activeGoogleResultsHandler === reportResults) activeGoogleResultsHandler = null
    }
  }, [containerId, query])

  if (!GOOGLE_SEARCH_ENGINE_ID.trim()) {
    return <p className="google-search-status" role="alert">Google search interface unavailable: search is not configured.</p>
  }

  return (
    <div className="google-search-panel">
      <p className="google-search-status" role="status" aria-live="polite">{status}</p>
      <div id={containerId} className="google-search-widget" />
    </div>
  )
}

function isInvalidExperience(value) {
  const trimmedValue = value.trim()
  if (!trimmedValue) return false

  const experience = Number(trimmedValue)
  return !Number.isFinite(experience) || experience < 0
}

function normalizeSearchTerm(value) {
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0)
      return code <= 0x1f || code === 0x7f ? ' ' : character
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeSearchTerm(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

function formatSearchTerm(value) {
  return `"${escapeSearchTerm(normalizeSearchTerm(value))}"`
}

function parseSkills(value) {
  const uniqueSkills = new Map()

  for (const skill of value.split(',')) {
    const normalizedSkill = normalizeSearchTerm(skill)
    if (!normalizedSkill) continue

    const key = normalizedSkill.toLowerCase()
    if (!uniqueSkills.has(key)) uniqueSkills.set(key, normalizedSkill)
  }

  return [...uniqueSkills.values()]
}

const SEARCH_HISTORY_STORAGE_KEY = 'talentxray.searchHistory'
const SEARCH_HISTORY_LIMIT = 10

function readSearchHistory() {
  try {
    const storedHistory = window.localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY)
    if (!storedHistory) return []

    const parsedHistory = JSON.parse(storedHistory)
    if (!Array.isArray(parsedHistory)) return []

    const validHistory = []
    for (const item of parsedHistory) {
      if (
        !item ||
        typeof item.jobTitle !== 'string' ||
        typeof item.skills !== 'string' ||
        typeof item.location !== 'string' ||
        typeof item.experience !== 'string' ||
        typeof item.searchedAt !== 'string'
      ) {
        continue
      }

      const jobTitle = normalizeSearchTerm(item.jobTitle)
      const location = normalizeSearchTerm(item.location)
      const experience = item.experience.trim()
      if (
        !jobTitle ||
        !location ||
        !experience ||
        isInvalidExperience(experience) ||
        !Number.isFinite(Date.parse(item.searchedAt))
      ) {
        continue
      }

      validHistory.push({
        jobTitle,
        skills: parseSkills(item.skills).join(', '),
        location,
        experience: String(Number(experience)),
        searchedAt: item.searchedAt,
      })

      if (validHistory.length === SEARCH_HISTORY_LIMIT) break
    }

    return validHistory
  } catch {
    return []
  }
}

function getSearchHistoryKey(criteria) {
  return JSON.stringify([
    normalizeSearchTerm(criteria.jobTitle).toLowerCase(),
    parseSkills(criteria.skills).map((skill) => skill.toLowerCase()).sort(),
    normalizeSearchTerm(criteria.location).toLowerCase(),
    String(Number(criteria.experience)),
  ])
}

function formatSearchDate(value) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return 'Date unavailable'
  }
}

function App() {
  const [criteria, setCriteria] = useState({
    jobTitle: '',
    skills: '',
    location: '',
    experience: '',
  })
  const [validationMessage, setValidationMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [googleQuery, setGoogleQuery] = useState('')
  const [googleSearchEnabled, setGoogleSearchEnabled] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const [searchHistory, setSearchHistory] = useState(readSearchHistory)
  const [historyMessage, setHistoryMessage] = useState('')

  function handleInputChange(event) {
    const { name, value } = event.target
    setCriteria((currentCriteria) => ({ ...currentCriteria, [name]: value }))
    setValidationMessage('')
    setSearchQuery('')
    setGoogleQuery('')
    setCopyMessage('')
  }

  function handleClearSearch() {
    setCriteria({ jobTitle: '', skills: '', location: '', experience: '' })
    setValidationMessage('')
    setSearchQuery('')
    setGoogleQuery('')
    setCopyMessage('')
  }

  function runSearch(searchCriteria) {
    const jobTitle = normalizeSearchTerm(searchCriteria.jobTitle)
    const location = normalizeSearchTerm(searchCriteria.location)
    const experienceInput = searchCriteria.experience.trim()
    const experience = Number(experienceInput)
    const messages = []

    if (!jobTitle) messages.push('Enter a job title.')
    if (!location) messages.push('Enter a location.')
    if (!experienceInput) {
      messages.push('Enter minimum experience in years.')
    } else if (isInvalidExperience(experienceInput)) {
      messages.push('Minimum experience must be a non-negative number.')
    }

    if (messages.length > 0) {
      setValidationMessage(messages.join(' '))
      setSearchQuery('')
      setGoogleQuery('')
      setCopyMessage('')
      return
    }

    const queryParts = [
      'site:linkedin.com/in/',
      formatSearchTerm(jobTitle),
    ]
    const skills = parseSkills(searchCriteria.skills)

    if (skills.length > 0) {
      queryParts.push(`(${skills.map(formatSearchTerm).join(' OR ')})`)
    }

    queryParts.push(formatSearchTerm(location))
    const experienceUnit = experience === 1 ? 'year' : 'years'
    queryParts.push(formatSearchTerm(`${experience} ${experienceUnit} experience`))

    setValidationMessage('')
    const generatedQuery = queryParts.join(' ')
    setSearchQuery(generatedQuery)
    setGoogleQuery(generatedQuery)
    setGoogleSearchEnabled(true)
    setCopyMessage('')

    const historyEntry = {
      jobTitle,
      skills: skills.join(', '),
      location,
      experience: String(experience),
      searchedAt: new Date().toISOString(),
    }
    const isConsecutiveDuplicate = searchHistory.length > 0 &&
      getSearchHistoryKey(searchHistory[0]) === getSearchHistoryKey(historyEntry)
    const nextHistory = isConsecutiveDuplicate
      ? searchHistory
      : [historyEntry, ...searchHistory].slice(0, SEARCH_HISTORY_LIMIT)

    if (!isConsecutiveDuplicate) setSearchHistory(nextHistory)

    try {
      window.localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(nextHistory))
      setHistoryMessage('')
    } catch {
      setHistoryMessage('Search history could not be saved in this browser.')
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    runSearch(criteria)
  }

  function handleRerunSearch(historyEntry) {
    const restoredCriteria = {
      jobTitle: historyEntry.jobTitle,
      skills: historyEntry.skills,
      location: historyEntry.location,
      experience: historyEntry.experience,
    }

    setCriteria(restoredCriteria)
    runSearch(restoredCriteria)
  }

  function handleClearHistory() {
    if (!window.confirm('Clear all saved searches?')) return

    setSearchHistory([])
    try {
      window.localStorage.removeItem(SEARCH_HISTORY_STORAGE_KEY)
      setHistoryMessage('')
    } catch {
      setHistoryMessage('Search history was cleared for this session but could not be removed from browser storage.')
    }
  }

  async function handleCopyQuery() {
    try {
      await navigator.clipboard.writeText(searchQuery)
      setCopyMessage('Query copied to clipboard.')
    } catch {
      setCopyMessage('Clipboard access is unavailable. Select and copy the query above.')
    }
  }

  return (
    <main className="workspace">
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="TalentX-Ray home">
          <span className="wordmark-mark" aria-hidden="true">X</span>
          <span>Talent<span className="wordmark-accent">X</span>-Ray</span>
        </a>
        <span className="topbar-label">TALENT INTELLIGENCE</span>
      </header>

      <div className="page-content" id="top">
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">CANDIDATE DISCOVERY</p>
          <h1 id="page-title">Find your next <em>great hire.</em></h1>
          <p className="intro-copy">
            Build a focused search around the experience and skills your team needs.
          </p>
        </section>

        <form className="search-form" noValidate onSubmit={handleSubmit}>
          <div className="form-heading">
            <div>
              <p className="eyebrow">SEARCH CRITERIA</p>
              <h2>Who are you looking for?</h2>
            </div>
            <span className="form-step"><span>01</span> / 01</span>
          </div>

          <div className="field-grid">
            <label className="field field-title">
              <span>Job title</span>
              <input
                name="jobTitle"
                type="text"
                placeholder="e.g. Product designer"
                required
                value={criteria.jobTitle}
                onChange={handleInputChange}
                aria-invalid={Boolean(validationMessage && !criteria.jobTitle.trim())}
              />
            </label>
            <label className="field field-skills">
              <span>Skills</span>
              <input
                name="skills"
                type="text"
                placeholder="e.g. CRM, lead generation"
                value={criteria.skills}
                onChange={handleInputChange}
              />
            </label>
            <label className="field field-location">
              <span>Location</span>
              <input
                name="location"
                type="text"
                placeholder="City, region, or remote"
                required
                value={criteria.location}
                onChange={handleInputChange}
                aria-invalid={Boolean(validationMessage && !criteria.location.trim())}
              />
            </label>
            <label className="field field-experience">
              <span>Minimum experience</span>
              <span className="number-input-wrap">
                <input
                  name="experience"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0"
                  required
                  value={criteria.experience}
                  onChange={handleInputChange}
                  aria-invalid={Boolean(validationMessage && (!criteria.experience.trim() || isInvalidExperience(criteria.experience)))}
                />
                <span>years</span>
              </span>
            </label>
          </div>

          <div className="form-footer">
            <p>Refine your criteria at any time.</p>
            <button className="search-button" type="submit">
              <span>Search X-Ray</span>
              <span className="button-arrow" aria-hidden="true">&#8594;</span>
            </button>
          </div>
          {validationMessage && <p className="validation-message" role="alert">{validationMessage}</p>}
        </form>

        {searchQuery && (
          <section className="query-preview" aria-labelledby="query-preview-title">
            <div className="query-preview-heading">
              <div>
                <p className="eyebrow">READY TO USE</p>
                <h2 id="query-preview-title">Search Query Preview</h2>
              </div>
              <button className="copy-button" type="button" onClick={handleCopyQuery}>
                Copy query
              </button>
            </div>
            <code className="query-text">{searchQuery}</code>
            <p className="copy-message" role="status">{copyMessage}</p>
            <p className="query-note">Google runs this query and displays its own search results below. Experience is only a search hint, not verification; TalentX-Ray does not create candidate profiles.</p>
          </section>
        )}

        <section className="results" aria-labelledby="results-title" aria-live="polite">
          <div className="results-heading">
            <div>
              <p className="eyebrow">YOUR SEARCH</p>
              <h2 id="results-title">Candidate results</h2>
            </div>
            <div className="results-actions">
              <span className="results-count">Google Search</span>
              <button className="clear-search-button" type="button" onClick={handleClearSearch}>
                Clear search
              </button>
            </div>
          </div>
          {googleQuery && (
            <p className="results-query">
              <span>Submitted query:</span> {googleQuery}
            </p>
          )}
          {validationMessage ? (
            <div className="results-notice" role="alert">
              <h3>Invalid search criteria</h3>
              <p>{validationMessage}</p>
            </div>
          ) : !googleQuery ? (
            <div className="empty-state">
              <div className="empty-icon" aria-hidden="true">
                <svg viewBox="0 0 48 48" fill="none">
                  <circle cx="20.5" cy="20.5" r="12.5" />
                  <path d="m30 30 9 9M15 20h11M20.5 14.5v11" />
                </svg>
              </div>
              <h3>Search ready</h3>
              <p>Submit valid criteria to display Google search results here.</p>
            </div>
          ) : null}
          {googleSearchEnabled && (
            <div hidden={!googleQuery}>
              <GoogleSearchResults query={googleQuery} />
            </div>
          )}
        </section>

        <section className="search-history" aria-labelledby="search-history-title">
          <div className="search-history-heading">
            <div>
              <p className="eyebrow">RECENT CRITERIA</p>
              <h2 id="search-history-title">Search History</h2>
            </div>
            <button
              className="clear-history-button"
              type="button"
              onClick={handleClearHistory}
              disabled={searchHistory.length === 0}
            >
              Clear history
            </button>
          </div>
          {historyMessage && <p className="history-message" role="status">{historyMessage}</p>}
          {searchHistory.length === 0 ? (
            <p className="history-empty">No saved searches yet. Valid searches will appear here.</p>
          ) : (
            <ol className="search-history-list">
              {searchHistory.map((entry, index) => (
                <li className="search-history-item" key={`${entry.searchedAt}-${index}`}>
                  <div className="history-entry-details">
                    <h3>{entry.jobTitle}</h3>
                    <p><span>Skills:</span> {entry.skills || 'None specified'}</p>
                    <p><span>Location:</span> {entry.location}</p>
                    <p>
                      <span>Minimum experience:</span> {entry.experience} {Number(entry.experience) === 1 ? 'year' : 'years'}
                    </p>
                    <time dateTime={entry.searchedAt}>Searched {formatSearchDate(entry.searchedAt)}</time>
                  </div>
                  <button
                    className="rerun-search-button"
                    type="button"
                    aria-label={`Re-run search for ${entry.jobTitle}`}
                    onClick={() => handleRerunSearch(entry)}
                  >
                    Re-run search
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <footer className="page-footer">
          <span>TalentX-Ray</span>
          <span>Candidate search workspace</span>
        </footer>
      </div>
    </main>
  )
}

export default App
