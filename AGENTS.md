# Twitter Account Location Flag - Chrome Extension

## Overview

A Chrome extension that displays country flag indicators next to Twitter/X usernames, showing account location information in a bracketed format: `[account flag | status icon | source flag]`.

## What It Does

The extension automatically:
- Detects usernames on Twitter/X pages (tweets, profiles, user cells)
- Queries Twitter's GraphQL API to retrieve account location data
- Displays location information using country flag emojis and status indicators
- Shows three pieces of information in brackets:
  - **Account-based location**: Where the account is registered
  - **Status indicator**: Accuracy/VPN detection
  - **Source region**: Where the account activity originates from
- Caches location data for 30 days to minimize API calls
- Works with dynamically loaded content (infinite scroll)
- Can be toggled on/off via popup interface

## Architecture

### Files Structure

- **manifest.json**: Chrome extension configuration (Manifest V3)
- **content.js**: Main content script that processes the page and manages flag display
- **pageScript.js**: Injected script that runs in page context to make authenticated API calls
- **countryFlags.js**: Country name to flag emoji mapping (ISO codes + special regions)
- **popup.html/popup.js**: Extension toggle interface
- **README.md**: User documentation

### How It Works

1. **Initialization**
   - Loads enabled state and cached location data from Chrome storage
   - Injects `pageScript.js` into page context for API access
   - Sets up MutationObserver to detect dynamically loaded content
   - Monitors URL changes for SPA navigation

2. **Username Detection**
   - Scans for Twitter UI elements: `article[data-testid="tweet"]`, `[data-testid="UserCell"]`, `[data-testid="User-Names"]`
   - Extracts usernames from links with pattern `/@username`
   - Filters out common routes (home, explore, notifications, etc.)

3. **Location Fetching**
   - Checks in-memory cache first (Map structure)
   - If not cached, queues API request with rate limiting
   - Uses page script to make same-origin authenticated requests
   - Processes queue with 2-second intervals and max 2 concurrent requests
   - Handles rate limiting with automatic retry after reset time

4. **API Communication**
   - Content script sends `__fetchLocation` message to page script
   - Page script makes fetch request to Twitter's GraphQL endpoint
   - Response sent back via `__locationResponse` message
   - Rate limit info communicated via `__rateLimitInfo` message

5. **Display Logic**
   - Creates bracketed display: `[🇺🇸 | ✅ | 🇺🇸]`
   - Shows loading shimmer while fetching data
   - Inserts flag before `@username` handle in User-Name container
   - Multiple insertion strategies for different Twitter UI layouts

6. **Caching**
   - In-memory Map for fast access
   - Persistent storage via Chrome storage API
   - 30-day expiry on cached entries
   - Debounced saves (every 5 seconds)
   - Null entries not cached (allows retry)

## API Details

### Endpoint
```
https://x.com/i/api/graphql/XRqGa7EeokUU5kppkh13EA/AboutAccountQuery
```

### Request
```javascript
{
  variables: {
    screenName: "username"
  }
}
```

### Response Path
```javascript
data.user_result_by_screen_name.result.about_profile
```

### Fields Used
- `account_based_in`: Account registration location
- `source`: Source of account activity
- `source_country`: Derived source country
- `location_accurate`: Boolean indicating location accuracy
- `learn_more_url`: URL for more information

## Display Format

### Indicator Symbols
- **🛡️ VPN Icon**: Account location differs from source (possible VPN/proxy)
- **ℹ️ Info Icon**: Location marked as inaccurate
- **✅ Accurate Icon**: Location marked as accurate
- **• Unknown Icon**: Data unavailable

### Example Displays
- `[🇺🇸 | ✅ | 🇺🇸]` - US account, accurate, US source
- `[🇬🇧 | 🛡️ | 🇺🇸]` - UK account, VPN detected, US source
- `[🇨🇦 | ℹ️ | 🇨🇦]` - Canada account, accuracy disclaimer, Canada source
- `[• | ℹ️ | 🇩🇪]` - Unknown account location, Germany source

## Rate Limiting

### Strategy
- Minimum 2 seconds between requests
- Maximum 2 concurrent requests
- Request queue with FIFO processing
- Automatic pause when rate limited
- Respects `x-rate-limit-reset` header
- Resumes after reset time expires

### Rate Limit Handling
- Detects 429 status codes
- Extracts reset time from response headers
- Pauses all requests until reset
- Logs wait time in minutes
- Does not cache failed requests due to rate limiting

## State Management

### Extension Toggle
- Stored in Chrome local storage (`extension_enabled`)
- Default: enabled
- Popup sends `extensionToggle` message to content script
- When disabled: removes all flags and stops processing
- When enabled: re-initializes and processes usernames

### Processing State
- `processingUsernames` Set: prevents duplicate API calls
- `data-flag-added` attribute: tracks processing status
  - `'processing'`: Currently fetching data
  - `'waiting'`: Waiting for another process
  - `'true'`: Successfully added
  - `'failed'`: Failed to add

## Performance Optimizations

1. **Caching**: 30-day persistent cache reduces API calls
2. **Debouncing**: 500ms delay on mutation observer
3. **Rate Limiting**: Prevents API throttling
4. **Duplicate Prevention**: Tracks processing usernames
5. **Shimmer Loading**: Visual feedback without blocking
6. **Parallel Processing**: Multiple usernames processed concurrently (with limits)
7. **Incremental Saves**: Cache saved every 5 seconds, not on every update

## Security & Privacy

- No data sent to third-party servers
- All API requests go directly to Twitter/X
- Uses user's existing Twitter authentication
- Location data cached locally only
- Extension context validation prevents stale operations
- Handles extension reload gracefully

## Error Handling

- Extension context invalidation detection
- Graceful fallback for missing headers
- Timeout handling (10 seconds per request)
- Failed requests allow retry (not cached)
- Multiple insertion strategies for flag placement
- Console logging for debugging

## Browser Permissions

- `activeTab`: Access current tab
- `storage`: Persistent cache storage
- `tabs`: Tab messaging
- Host permissions: `https://x.com/*`, `https://twitter.com/*`

## Known Limitations

- Requires user to be logged into Twitter/X
- Only works for accounts with location data available
- Country names must match mapping in `countryFlags.js`
- Rate limiting applies (Twitter API limits)
- Some accounts may not have location information
- Accuracy depends on Twitter's data quality

## Development Notes

### Key Functions

- `getUserLocation(screenName)`: Main entry point for fetching location
- `extractUsername(element)`: Extracts username from DOM element
- `buildBracketedDisplay(displayInfo)`: Creates flag display element
- `addFlagToUsername(element, screenName)`: Adds flag to DOM
- `processUsernames()`: Scans page for usernames
- `processRequestQueue()`: Manages API request queue

### Data Flow

```
DOM Element → extractUsername() → getUserLocation() → 
  Cache Check → Queue Request → makeLocationRequest() →
  Page Script → Twitter API → Response → 
  normalizeLocationData() → buildLocationDisplayInfo() →
  buildBracketedDisplay() → addFlagToUsername() → DOM Update
```

### Extension Points

- Add new country mappings in `countryFlags.js`
- Adjust rate limiting in `MIN_REQUEST_INTERVAL` and `MAX_CONCURRENT_REQUESTS`
- Modify cache expiry in `CACHE_EXPIRY_DAYS`
- Customize display format in `buildBracketedDisplay()`
- Add new status indicators in indicator creation functions

## Troubleshooting

### Flags Not Appearing
1. Verify user is logged into Twitter/X
2. Check browser console for errors
3. Verify account has location data
4. Check if extension is enabled in popup
5. Try refreshing the page

### Rate Limiting Issues
- Extension automatically handles rate limits
- Wait time displayed in console
- Requests resume after reset time
- Consider increasing `MIN_REQUEST_INTERVAL` if persistent

### Cache Issues
- Clear cache by reloading extension
- Check Chrome storage in DevTools
- Verify cache expiry settings

## Future Enhancements

- Configurable display format
- Custom flag styles
- Bulk location fetching
- Export/import cache
- Statistics dashboard
- Configurable rate limits
- Filter by country
- Location history tracking
