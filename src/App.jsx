import { useEffect, useId, useRef, useState } from 'react'
import './App.css'

import employee1 from './assets/employee1_top.png'
import employee2 from './assets/employee2_main.png'
import employee3 from './assets/employee3_left.png'

const GOOGLE_SEARCH_ENGINE_ID = '64a5934e4ed5142db'
const GOOGLE_SEARCH_SCRIPT_ID = 'talentxray-google-search-script'
const GOOGLE_SEARCH_SCRIPT_TIMEOUT = 15000
const GOOGLE_RESULT_TIMEOUT = 8000

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

  if (loadedApi) {
    return Promise.resolve(loadedApi)
  }

  if (googleScriptPromise) {
    return googleScriptPromise
  }

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

    const script =
      document.getElementById(GOOGLE_SEARCH_SCRIPT_ID) ||
      document.createElement('script')

    const finish = (error, api = getGoogleSearchApi()) => {
      window.clearTimeout(timeoutId)
      window.clearTimeout(apiPollId)

      script.removeEventListener('load', handleLoad)
      script.removeEventListener('error', handleError)

      if (error) {
        reject(error)
      } else {
        resolve(api)
      }
    }

    const handleLoad = () => {
      const waitForApi = () => {
        const api = getGoogleSearchApi()

        if (api) {
          finish(undefined, api)
        } else {
          apiPollId = window.setTimeout(waitForApi, 50)
        }
      }

      waitForApi()
    }

    const handleError = () => {
      finish(
        new Error('Google Search Element script failed to load.')
      )
    }

    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', handleError, { once: true })

    timeoutId = window.setTimeout(
      () =>
        finish(
          new Error('Google Search Element script timed out.')
        ),
      GOOGLE_SEARCH_SCRIPT_TIMEOUT,
    )

    if (!script.id) {
      script.id = GOOGLE_SEARCH_SCRIPT_ID
      script.async = true
      script.src = `https://cse.google.com/cse.js?cx=${encodeURIComponent(
        GOOGLE_SEARCH_ENGINE_ID,
      )}`

      document.head.appendChild(script)
    }
  }).catch((error) => {
    googleScriptPromise = undefined
    document.getElementById(GOOGLE_SEARCH_SCRIPT_ID)?.remove()
    throw error
  })

  return googleScriptPromise
}

/* =========================================================
   GOOGLE SEARCH RESULTS
   ========================================================= */

function GoogleSearchResults({ query, isVisible }) {
  const reactId = useId().replaceAll(':', '')
  const containerId = `talentxray-google-results-${reactId}`

  const elementRef = useRef(null)

  const [status, setStatus] = useState('')
  const [useGoogleFallback, setUseGoogleFallback] = useState(false)

  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(
    query,
  )}`

  useEffect(() => {
    if (!query || !isVisible) {
      return undefined
    }

    let active = true
    let resultTimeoutId

    const reportResults = (
      elementName,
      resultQuery,
      results,
    ) => {
      if (
        !active ||
        elementName !== googleResultsElement?.gname ||
        resultQuery !== query
      ) {
        return
      }

      window.clearTimeout(resultTimeoutId)

      if (Array.isArray(results) && results.length > 0) {
        setUseGoogleFallback(false)
        setStatus(
          'Google returned results. They are displayed below.',
        )
      } else if (Array.isArray(results)) {
        setUseGoogleFallback(false)
        setStatus(
          'Google returned no results for this search.',
        )
      } else {
        setUseGoogleFallback(true)
        setStatus(
          'Google did not return a usable response.',
        )
      }
    }

    activeGoogleResultsHandler = reportResults

    setUseGoogleFallback(false)
    setStatus('Search submitted. Loading Google results...')

    resultTimeoutId = window.setTimeout(() => {
      if (active) {
        setUseGoogleFallback(true)
        setStatus(
          'Google results did not load here. Open the search directly in Google.',
        )
      }
    }, GOOGLE_RESULT_TIMEOUT)

    loadGoogleSearchApi()
      .then((api) => {
        if (!active) return

        let element = elementRef.current

        if (!element) {
          const existingElements = new Set(
            Object.values(api.getAllElements()),
          )

          api.render({
            div: containerId,
            tag: 'searchresults-only',
          })

          const renderedElements = Object.values(
            api.getAllElements(),
          )

          element =
            renderedElements.find(
              (searchElement) =>
                !existingElements.has(searchElement) &&
                searchElement.type === 'searchresults-only',
            ) ||
            renderedElements.find(
              (searchElement) =>
                searchElement.type === 'searchresults-only',
            )
        }

        if (!element || typeof element.execute !== 'function') {
          throw new Error(
            'Google Search Element could not be initialized.',
          )
        }

        elementRef.current = element
        googleResultsElement = element

        element.execute(query)
      })
      .catch(() => {
        if (!active) return

        window.clearTimeout(resultTimeoutId)

        setUseGoogleFallback(true)
        setStatus(
          'Google search interface unavailable. Open the direct search below.',
        )
      })

    return () => {
      active = false

      window.clearTimeout(resultTimeoutId)

      if (
        activeGoogleResultsHandler === reportResults
      ) {
        activeGoogleResultsHandler = null
      }
    }
  }, [containerId, isVisible, query])

  if (!GOOGLE_SEARCH_ENGINE_ID.trim()) {
    return (
      <p className="google-search-status" role="alert">
        Google search interface unavailable.
      </p>
    )
  }

  return (
    <div className="google-search-panel">

      <p
        className="google-search-status"
        role="status"
        aria-live="polite"
      >
        {status}
      </p>

      {useGoogleFallback ? (
        <div className="google-search-fallback">

          <div>
            <strong>
              Candidate results are not available in this page
            </strong>

            <p>
              Google did not return results here.
              Open the same search in a new tab.
            </p>
          </div>

          <a
            className="google-search-link"
            href={googleUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open in Google
            <span aria-hidden="true">↗</span>
          </a>

        </div>
      ) : (
        <div
          id={containerId}
          className="google-search-widget"
        />
      )}

    </div>
  )
}

/* =========================================================
   SEARCH HELPERS
   ========================================================= */

function isInvalidExperience(value) {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return false
  }

  const experience = Number(trimmedValue)

  return (
    !Number.isFinite(experience) ||
    experience < 0
  )
}

function normalizeSearchTerm(value) {
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0)

      return code <= 0x1f || code === 0x7f
        ? ' '
        : character
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeSearchTerm(value) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
}

function formatSearchTerm(value) {
  return `"${escapeSearchTerm(
    normalizeSearchTerm(value),
  )}"`
}

function parseSkills(value) {
  const uniqueSkills = new Map()

  for (const skill of value.split(',')) {
    const normalizedSkill =
      normalizeSearchTerm(skill)

    if (!normalizedSkill) continue

    const key = normalizedSkill.toLowerCase()

    if (!uniqueSkills.has(key)) {
      uniqueSkills.set(key, normalizedSkill)
    }
  }

  return [...uniqueSkills.values()]
}

function pushCandidatesPage() {
  window.history.pushState(
    null,
    '',
    '#candidates',
  )
}

/* =========================================================
   EMPLOYEE NETWORK
   ========================================================= */

function CandidateNetwork() {
  return (
    <div
      className="talent-visual"
      aria-hidden="true"
    >

      {/* Large animated orbit */}
      <div className="talent-orbit"></div>

      {/* Decorative orbit dots */}
      <span className="orbit-dot orbit-dot-1"></span>
      <span className="orbit-dot orbit-dot-2"></span>
      <span className="orbit-dot orbit-dot-3"></span>

      {/* =================================================
          MAIN EMPLOYEE
          ================================================= */}

      <div className="talent-card talent-card-main">

        <div className="employee-photo-wrap main-photo-wrap">
          <img
            src={employee2}
            alt=""
            className="employee-photo employee-photo-main"
          />
        </div>

        <div className="talent-lines">

          <span className="line-large"></span>

          <span className="line-medium"></span>

          <span className="line-small"></span>

        </div>

        <div className="verified">
          ✓
        </div>

      </div>

      {/* =================================================
          TOP EMPLOYEE
          ================================================= */}

      <div className="talent-card talent-card-top">

        <div className="employee-photo-wrap">
          <img
            src={employee1}
            alt=""
            className="employee-photo"
          />
        </div>

        <div className="talent-lines">

          <span className="line-large"></span>

          <span className="line-medium"></span>

        </div>

      </div>

      {/* =================================================
          LEFT EMPLOYEE
          ================================================= */}

      <div className="talent-card talent-card-left">

        <div className="employee-photo-wrap">
          <img
            src={employee3}
            alt=""
            className="employee-photo"
          />
        </div>

        <div className="talent-lines">

          <span className="line-large"></span>

          <span className="line-medium"></span>

        </div>

      </div>

      {/* =================================================
          LOCATION ICON
          ================================================= */}

      <div className="talent-icon talent-location">

        <svg viewBox="0 0 24 24">
          <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
          <circle
            cx="12"
            cy="10"
            r="2.5"
          />
        </svg>

      </div>

      <div className="talent-icon talent-people">
        <svg viewBox="0 0 24 24">
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M3.5 19c.4-3.3 2.2-5 5.5-5s5.1 1.7 5.5 5M15 14.5c2.8 0 4.4 1.4 4.8 4.5" />
        </svg>
      </div>

      {/* =================================================
          EMAIL ICON
          ================================================= */}

      <div className="talent-icon talent-mail">

        <svg viewBox="0 0 24 24">
          <rect
            x="3"
            y="5"
            width="18"
            height="14"
            rx="2"
          />

          <path d="m4 7 8 6 8-6" />
        </svg>

      </div>

      {/* =================================================
          WORK ICON
          ================================================= */}

      <div className="talent-icon talent-work">

        <svg viewBox="0 0 24 24">
          <rect
            x="3"
            y="7"
            width="18"
            height="13"
            rx="2"
          />

          <path d="M8 7V4h8v3M3 12h18" />
        </svg>

      </div>

    </div>
  )
}

/* =========================================================
   SEARCH HISTORY
   ========================================================= */

const SEARCH_HISTORY_STORAGE_KEY =
  'talentxray.searchHistory'

const SEARCH_HISTORY_LIMIT = 10

function readSearchHistory() {
  try {
    const storedHistory =
      window.localStorage.getItem(
        SEARCH_HISTORY_STORAGE_KEY,
      )

    if (!storedHistory) {
      return []
    }

    const parsedHistory =
      JSON.parse(storedHistory)

    if (!Array.isArray(parsedHistory)) {
      return []
    }

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

      const jobTitle =
        normalizeSearchTerm(item.jobTitle)

      const location =
        normalizeSearchTerm(item.location)

      const experience =
        item.experience.trim()

      if (
        !jobTitle ||
        !location ||
        !experience ||
        isInvalidExperience(experience) ||
        !Number.isFinite(
          Date.parse(item.searchedAt),
        )
      ) {
        continue
      }

      validHistory.push({
        jobTitle,
        skills: parseSkills(item.skills).join(', '),
        location,
        experience: String(
          Number(experience),
        ),
        searchedAt: item.searchedAt,
      })

      if (
        validHistory.length ===
        SEARCH_HISTORY_LIMIT
      ) {
        break
      }
    }

    return validHistory

  } catch {
    return []
  }
}

function getSearchHistoryKey(criteria) {
  return JSON.stringify([
    normalizeSearchTerm(
      criteria.jobTitle,
    ).toLowerCase(),

    parseSkills(criteria.skills)
      .map((skill) => skill.toLowerCase())
      .sort(),

    normalizeSearchTerm(
      criteria.location,
    ).toLowerCase(),

    String(Number(criteria.experience)),
  ])
}

function formatSearchDate(value) {
  try {
    return new Intl.DateTimeFormat(
      undefined,
      {
        dateStyle: 'medium',
        timeStyle: 'short',
      },
    ).format(new Date(value))

  } catch {
    return 'Date unavailable'
  }
}

/* =========================================================
   MAIN APP
   ========================================================= */

function App() {

  const [
    isCandidatesPage,
    setIsCandidatesPage,
  ] = useState(
    window.location.hash === '#candidates',
  )

  const [criteria, setCriteria] = useState({
    jobTitle: '',
    skills: '',
    location: '',
    experience: '0',
  })

  const [
    validationMessage,
    setValidationMessage,
  ] = useState('')

  const [
    searchQuery,
    setSearchQuery,
  ] = useState('')

  const [
    googleQuery,
    setGoogleQuery,
  ] = useState('')

  const [
    googleSearchEnabled,
    setGoogleSearchEnabled,
  ] = useState(false)

  const [
    copyMessage,
    setCopyMessage,
  ] = useState('')

  const [
    searchHistory,
    setSearchHistory,
  ] = useState(readSearchHistory)

  const [
    historyMessage,
    setHistoryMessage,
  ] = useState('')

  const [
    isSearching,
    setIsSearching,
  ] = useState(false)

  const searchAnimationTimer =
    useRef(null)

  useEffect(() => {
    return () => {
      window.clearTimeout(
        searchAnimationTimer.current,
      )
    }
  }, [])

  /* =====================================================
     HASH NAVIGATION
     ===================================================== */

  useEffect(() => {

    const syncPageWithHash = () => {

      const showCandidates =
        window.location.hash === '#candidates'

      setIsCandidatesPage(
        showCandidates,
      )

      window.scrollTo({
        top: 0,
        behavior: 'auto',
      })
    }

    window.addEventListener(
      'hashchange',
      syncPageWithHash,
    )

    window.addEventListener(
      'popstate',
      syncPageWithHash,
    )

    return () => {

      window.removeEventListener(
        'hashchange',
        syncPageWithHash,
      )

      window.removeEventListener(
        'popstate',
        syncPageWithHash,
      )

    }

  }, [])

  /* =====================================================
     INPUT CHANGE
     ===================================================== */

  function handleInputChange(event) {

    const {
      name,
      value,
    } = event.target

    setCriteria(
      (currentCriteria) => ({
        ...currentCriteria,
        [name]: value,
      }),
    )

    setValidationMessage('')
    setSearchQuery('')
    setGoogleQuery('')
    setCopyMessage('')
  }

  /* =====================================================
     SEARCH
     ===================================================== */

  function runSearch(searchCriteria) {

    const jobTitle =
      normalizeSearchTerm(
        searchCriteria.jobTitle,
      )

    const location =
      normalizeSearchTerm(
        searchCriteria.location,
      )

    const experienceInput =
      searchCriteria.experience.trim()

    const experience =
      Number(experienceInput)

    const messages = []

    if (!jobTitle) {
      messages.push(
        'Enter a job title.',
      )
    }

    if (!location) {
      messages.push(
        'Enter a location.',
      )
    }

    if (!experienceInput) {

      messages.push(
        'Enter minimum experience in years.',
      )

    } else if (
      isInvalidExperience(
        experienceInput,
      )
    ) {

      messages.push(
        'Minimum experience must be a non-negative number.',
      )

    }

    if (messages.length > 0) {

      setValidationMessage(
        messages.join(' '),
      )

      setSearchQuery('')
      setGoogleQuery('')
      setCopyMessage('')

      return false
    }

    const queryParts = [
      'site:linkedin.com/in/',
      formatSearchTerm(jobTitle),
    ]

    const skills =
      parseSkills(
        searchCriteria.skills,
      )

    if (skills.length > 0) {

      queryParts.push(
        `(${skills
          .map(formatSearchTerm)
          .join(' OR ')})`,
      )

    }

    queryParts.push(
      formatSearchTerm(location),
    )

    const experienceUnit =
      experience === 1
        ? 'year'
        : 'years'

    queryParts.push(
      formatSearchTerm(
        `${experience} ${experienceUnit} experience`,
      ),
    )

    setValidationMessage('')

    const generatedQuery =
      queryParts.join(' ')

    setSearchQuery(
      generatedQuery,
    )

    setGoogleQuery(
      generatedQuery,
    )

    setGoogleSearchEnabled(true)
    setCopyMessage('')

    const historyEntry = {
      jobTitle,
      skills: skills.join(', '),
      location,
      experience: String(
        experience,
      ),
      searchedAt:
        new Date().toISOString(),
    }

    const isConsecutiveDuplicate =
      searchHistory.length > 0 &&
      getSearchHistoryKey(
        searchHistory[0],
      ) ===
        getSearchHistoryKey(
          historyEntry,
        )

    const nextHistory =
      isConsecutiveDuplicate
        ? searchHistory
        : [
            historyEntry,
            ...searchHistory,
          ].slice(
            0,
            SEARCH_HISTORY_LIMIT,
          )

    if (!isConsecutiveDuplicate) {
      setSearchHistory(
        nextHistory,
      )
    }

    try {

      window.localStorage.setItem(
        SEARCH_HISTORY_STORAGE_KEY,
        JSON.stringify(
          nextHistory,
        ),
      )

      setHistoryMessage('')

    } catch {

      setHistoryMessage(
        'Search history could not be saved in this browser.',
      )

    }

    return true
  }

  function handleSubmit(event) {

    event.preventDefault()

    window.clearTimeout(
      searchAnimationTimer.current,
    )

    setIsSearching(true)

    searchAnimationTimer.current =
      window.setTimeout(() => {
        setIsSearching(false)
      }, 900)

    if (runSearch(criteria)) {

      pushCandidatesPage()

      setIsCandidatesPage(true)

      window.scrollTo({
        top: 0,
        behavior: 'auto',
      })
    }
  }

  function handleRerunSearch(
    historyEntry,
  ) {

    const restoredCriteria = {
      jobTitle:
        historyEntry.jobTitle,

      skills:
        historyEntry.skills,

      location:
        historyEntry.location,

      experience:
        historyEntry.experience,
    }

    setCriteria(
      restoredCriteria,
    )

    if (
      runSearch(
        restoredCriteria,
      )
    ) {

      pushCandidatesPage()

      setIsCandidatesPage(true)

      window.scrollTo({
        top: 0,
        behavior: 'auto',
      })
    }
  }

  function handleClearHistory() {

    if (
      !window.confirm(
        'Clear all saved searches?',
      )
    ) {
      return
    }

    setSearchHistory([])

    try {

      window.localStorage.removeItem(
        SEARCH_HISTORY_STORAGE_KEY,
      )

      setHistoryMessage('')

    } catch {

      setHistoryMessage(
        'Search history was cleared for this session but could not be removed from browser storage.',
      )

    }
  }

  async function handleCopyQuery() {

    try {

      await navigator.clipboard.writeText(
        searchQuery,
      )

      setCopyMessage(
        'Query copied to clipboard.',
      )

    } catch {

      setCopyMessage(
        'Clipboard access is unavailable. Select and copy the query above.',
      )

    }
  }

  return (

    <main className="workspace">

      {/* =================================================
          TOP NAVBAR
          ================================================= */}

      <header className="topbar">

        <a
          className="wordmark"
          href="#top"
          aria-label="FindBest-1 home"
        >
          <span
            className="wordmark-mark"
            aria-hidden="true"
          >
            F
          </span>

          <span>
            FindBest-1
          </span>
        </a>

        <nav
          className="main-nav"
          aria-label="Main navigation"
        >

          <a
            className={`nav-link${
              isCandidatesPage
                ? ''
                : ' is-active'
            }`}
            href="#top"
          >

            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="m3.5 10 8.5-7 8.5 7M6 9v11h12V9M10 20v-6h4v6" />
            </svg>

            Home

          </a>

          <a
            className={`nav-link${
              isCandidatesPage
                ? ' is-active'
                : ''
            }`}
            href="#candidates"
          >

            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                cx="9"
                cy="8"
                r="3"
              />

              <path d="M3.5 20c.4-3.5 2.3-5.2 5.5-5.2s5.1 1.7 5.5 5.2M16 5.5a3 3 0 0 1 0 5.8M17 15c2.2.5 3.4 2.1 3.7 4.5" />
            </svg>

            Candidates

          </a>

          <a
            className="nav-link"
            href="#search-history"
          >

            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M6 3.5h12v17l-6-4-6 4z" />
            </svg>

            Saved Searches

          </a>

        </nav>

        <div className="topbar-tools">

          <span className="theme-icon">
            ☼
          </span>

          <span className="topbar-status">

            <span
              className="status-dot"
              aria-hidden="true"
            />

            Search Workspace Online

          </span>

          <span
            className="account-icon"
            aria-label="Account"
          >

            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="8"
                r="3.2"
              />

              <path d="M5.5 20c.5-4.1 2.7-6.2 6.5-6.2s6 2.1 6.5 6.2" />
            </svg>

          </span>

          <span
            className="account-chevron"
            aria-hidden="true"
          >
            ⌄
          </span>

        </div>

      </header>

      {/* =================================================
          HOME PAGE
          ================================================= */}

      <div
        className="page-content"
        id="top"
        hidden={isCandidatesPage}
      >

        <section
          className="intro"
          aria-labelledby="page-title"
        >

          {/* LEFT HERO TEXT */}

          <div className="intro-copy-block">

            <p className="eyebrow">
              TALENT DISCOVERY PLATFORM
            </p>

            <h1 id="page-title">

              Find the right talent,

              <br />

              <em>faster.</em>

            </h1>

            <p className="intro-copy">
              Search, discover and connect with
              the best candidates for your team
              — all in one place.
            </p>

          </div>

          {/* RIGHT EMPLOYEE ANIMATION */}

          <div className="hero-visual">

            <CandidateNetwork />

            <p className="hero-tagline">
              BETTER TALENT.
              <br />
              STRONGER TEAMS.
            </p>

          </div>

        </section>

        {/* =================================================
            SEARCH FORM
            ================================================= */}

        <form
          className="search-form"
          id="candidate-search"
          noValidate
          onSubmit={handleSubmit}
        >

          <div className="field-grid">

            {/* JOB TITLE */}

            <label className="field field-title">

              <span className="field-label">

                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <rect
                    x="3"
                    y="7"
                    width="18"
                    height="14"
                    rx="2"
                  />

                  <path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2" />
                </svg>

                Job Title

              </span>

              <input
                name="jobTitle"
                type="text"
                placeholder="e.g. Sales Manager"
                required
                value={criteria.jobTitle}
                onChange={
                  handleInputChange
                }
              />

            </label>

            {/* SKILLS */}

            <label className="field field-skills">

              <span className="field-label">

                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    cx="12"
                    cy="5"
                    r="2.2"
                  />

                  <circle
                    cx="6"
                    cy="17"
                    r="2.2"
                  />

                  <circle
                    cx="18"
                    cy="17"
                    r="2.2"
                  />

                  <path d="m10.9 7-3.8 7.8m6-7.8 3.8 7.8M8.2 17h7.6" />
                </svg>

                Skills

              </span>

              <input
                name="skills"
                type="text"
                placeholder="e.g. React, Node.js, Python"
                value={criteria.skills}
                onChange={
                  handleInputChange
                }
              />

            </label>

            {/* LOCATION */}

            <label className="field field-location">

              <span className="field-label">

                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M19 10c0 5-7 12-7 12S5 15 5 10a7 7 0 1 1 14 0Z" />

                  <circle
                    cx="12"
                    cy="10"
                    r="2.3"
                  />
                </svg>

                Location

              </span>

              <input
                name="location"
                type="text"
                placeholder="e.g. Bangalore"
                required
                value={criteria.location}
                onChange={
                  handleInputChange
                }
              />

            </label>

            {/* EXPERIENCE */}

            <label className="field field-experience">

              <span className="field-label">

                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <rect
                    x="3"
                    y="5"
                    width="18"
                    height="16"
                    rx="2"
                  />

                  <path d="M8 3v4m8-4v4M3 10h18" />

                </svg>

                Minimum Experience

              </span>

              <span className="number-input-wrap">

                <input
                  name="experience"
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={
                    criteria.experience
                  }
                  onChange={
                    handleInputChange
                  }
                />

                <span>
                  years
                </span>

              </span>

            </label>

            {/* SEARCH BUTTON */}

            <button
              className={`search-button${
                isSearching
                  ? ' is-searching'
                  : ''
              }`}
              type="submit"
              aria-busy={isSearching}
            >

              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  cx="10.8"
                  cy="10.8"
                  r="6.4"
                />

                <path d="m15.5 15.5 5 5" />

              </svg>

              Find Candidates

              <span aria-hidden="true">
                →
              </span>

            </button>

          </div>

          <div className="more-filters">

            <button
              className="more-filters-button"
              type="button"
            >

              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M4 6h16M7 12h10M10 18h4" />

                <circle
                  cx="8"
                  cy="6"
                  r="2"
                />

                <circle
                  cx="15"
                  cy="12"
                  r="2"
                />

                <circle
                  cx="12"
                  cy="18"
                  r="2"
                />
              </svg>

              More filters

              <span>
                ⌄
              </span>

            </button>

          </div>

          {validationMessage && (
            <p
              className="validation-message"
              role="alert"
            >
              {validationMessage}
            </p>
          )}

        </form>

        {/* =================================================
            FEATURES
            ================================================= */}

        <section
          className="feature-row"
          aria-label="FindBest benefits"
        >

          <div className="feature-item">

            <div
              className="feature-icon"
              aria-hidden="true"
            >
              ⚡
            </div>

            <div>
              <strong>
                Faster Hiring
              </strong>

              <span>
                Find the right people faster
              </span>
            </div>

          </div>

          <div className="feature-item">

            <div
              className="feature-icon"
              aria-hidden="true"
            >
              ♧
            </div>

            <div>
              <strong>
                Verified Candidates
              </strong>

              <span>
                Discover quality talent
              </span>
            </div>

          </div>

          <div className="feature-item">

            <div
              className="feature-icon"
              aria-hidden="true"
            >
              ◈
            </div>

            <div>
              <strong>
                Trusted Results
              </strong>

              <span>
                Relevant search results
              </span>
            </div>

          </div>

          <div className="feature-item">

            <div
              className="feature-icon"
              aria-hidden="true"
            >
              ◎
            </div>

            <div>
              <strong>
                Better Teams
              </strong>

              <span>
                Build stronger teams
              </span>
            </div>

          </div>

        </section>

        {/* =================================================
            SAVED SEARCHES
            ================================================= */}

        <section
          className="search-history"
          id="search-history"
          aria-live="polite"
        >

          <div className="search-history-heading">

            <h2>
              Saved searches
            </h2>

            <button
              className="clear-history-button"
              type="button"
              onClick={
                handleClearHistory
              }
              disabled={
                searchHistory.length === 0
              }
            >
              Clear history
            </button>

          </div>

          {historyMessage && (
            <p
              className="history-message"
              role="alert"
            >
              {historyMessage}
            </p>
          )}

          {searchHistory.length === 0 ? (

            <p className="history-empty">
              No saved searches yet.
              Run a search to save it here.
            </p>

          ) : (

            <ul className="search-history-list">

              {searchHistory.map(
                (entry) => (

                  <li
                    key={`${entry.searchedAt}-${entry.jobTitle}-${entry.location}`}
                    className="search-history-item"
                  >

                    <div className="history-entry-details">

                      <h3>
                        {entry.jobTitle}
                      </h3>

                      <p>
                        <span>
                          Location:
                        </span>{' '}
                        {entry.location}
                      </p>

                      {entry.skills && (
                        <p>
                          <span>
                            Skills:
                          </span>{' '}
                          {entry.skills}
                        </p>
                      )}

                      <p>
                        <span>
                          Experience:
                        </span>{' '}
                        {entry.experience}{' '}
                        {Number(
                          entry.experience,
                        ) === 1
                          ? 'year'
                          : 'years'}
                        +
                      </p>

                      <time
                        dateTime={
                          entry.searchedAt
                        }
                      >
                        {formatSearchDate(
                          entry.searchedAt,
                        )}
                      </time>

                    </div>

                    <button
                      className="rerun-search-button"
                      type="button"
                      onClick={() =>
                        handleRerunSearch(
                          entry,
                        )
                      }
                    >
                      Rerun
                    </button>

                  </li>

                ),
              )}

            </ul>

          )}

        </section>

      </div>

      {/* =================================================
          CANDIDATE PAGE
          ================================================= */}

      <section
        className="candidate-page"
        hidden={!isCandidatesPage}
      >

        <div className="candidate-page-topline">

          <a
            className="back-to-dashboard"
            href="#top"
          >
            <span aria-hidden="true">
              ←
            </span>

            Back to dashboard
          </a>

          <span className="candidate-source-badge">

            <span
              className="status-dot"
              aria-hidden="true"
            />

            Public web results

          </span>

        </div>

        {googleQuery ? (

          <>

            <section
              className="candidate-page-heading"
              aria-labelledby="candidate-page-title"
            >

              <div>

                <p className="eyebrow">
                  YOUR SEARCH RESULTS
                </p>

                <h1 id="candidate-page-title">

                  Candidates for{' '}

                  <span>
                    {normalizeSearchTerm(
                      criteria.jobTitle,
                    )}
                  </span>

                </h1>

                <p className="candidate-page-description">
                  Review matching public
                  profiles, then reach out to
                  the candidates that fit your
                  needs.
                </p>

              </div>

              <a
                className="edit-search-button"
                href="#top"
              >
                Edit search
              </a>

            </section>

            <section
              className="criteria-summary"
              aria-label="Search criteria"
            >

              <span>
                <strong>
                  Location
                </strong>

                {normalizeSearchTerm(
                  criteria.location,
                )}
              </span>

              {parseSkills(
                criteria.skills,
              ).length > 0 && (

                <span>

                  <strong>
                    Skills
                  </strong>

                  {parseSkills(
                    criteria.skills,
                  ).join(', ')}

                </span>

              )}

              <span>

                <strong>
                  Experience
                </strong>

                {criteria.experience}{' '}

                {Number(
                  criteria.experience,
                ) === 1
                  ? 'year'
                  : 'years'}
                +

              </span>

            </section>

            <section
              className="candidate-results-card"
              aria-labelledby="candidate-results-title"
              aria-live="polite"
            >

              <div className="candidate-results-card-heading">

                <div>

                  <h2 id="candidate-results-title">
                    Matching profiles
                  </h2>

                  <p>
                    Search results from Google
                  </p>

                </div>

                <span className="results-count">
                  LinkedIn profiles
                </span>

              </div>

              {googleSearchEnabled && (
                <GoogleSearchResults
                  query={googleQuery}
                  isVisible={
                    isCandidatesPage
                  }
                />
              )}

            </section>

            {searchQuery && (

              <details className="candidate-query-details">

                <summary>
                  View search query
                </summary>

                <code className="query-text">
                  {searchQuery}
                </code>

                <button
                  className="copy-button"
                  type="button"
                  onClick={
                    handleCopyQuery
                  }
                >
                  Copy query
                </button>

                <p
                  className="copy-message"
                  role="status"
                >
                  {copyMessage}
                </p>

              </details>

            )}

            <p className="candidate-results-disclaimer">
              FindBest-1 searches public web
              results. Profile details and
              experience are provided by
              third-party sources and have not
              been independently verified.
            </p>

          </>

        ) : (

          <section className="candidate-empty-page">

            <span
              className="empty-icon"
              aria-hidden="true"
            >

              <svg
                viewBox="0 0 48 48"
                fill="none"
              >

                <circle
                  cx="20.5"
                  cy="20.5"
                  r="12.5"
                />

                <path d="m30 30 9 9M15 20h11M20.5 14.5v11" />

              </svg>

            </span>

            <h1>
              No candidate search yet
            </h1>

            <p>
              Set your search criteria on
              the dashboard to find matching
              public profiles.
            </p>

            <a
              className="edit-search-button"
              href="#top"
            >
              Start a search
            </a>

          </section>

        )}

      </section>

    </main>
  )
}

export default App