# Requirements Document

## Introduction

The Campus Map Explorer expands the Tools version of Campus Map into a search-and-inspection workspace while preserving the AI Answer Canvas as a map-only surface. Students can discover common buildings, search the complete building catalog, inspect task-relevant building destinations and sources, save buildings to an account, share deep links, and start walking directions. The same data contracts support richer agent-callable map widgets without placing the Tools rail inside AI mode.

The feature uses repository-backed UBC Vancouver data. The interface identifies source freshness, omits information with undocumented meaning, and renders entrance graphics only from verified entrance coordinates joined to a known building. Product-curated popular buildings do not represent measured foot traffic or occupancy.

## Glossary

- **Campus_Map_Explorer**: The Tools-mode Campus Map workspace containing the Building_Rail and Map_Canvas.
- **Tools_Mode**: The authenticated or guest workspace reached through the global Tools area.
- **AI_Mode**: The conversational workspace containing Chat and the AI_Answer_Canvas.
- **AI_Answer_Canvas**: The map-only visual pane driven by agent tool results in AI_Mode.
- **Building_Rail**: The Tools-only region for building search, popular and saved lists, building details, and directions controls.
- **Map_Canvas**: The interactive MapLibre and deck.gl campus map.
- **Building_Catalog**: The set of current building records with unique building codes and map geometry.
- **Search_Result**: A Building_Catalog entry returned from a Building_Rail query.
- **Building_Record**: The merged, public-safe record for one building and directly associated addresses, entrances, rooms, bookable spaces, and points of interest.
- **Building_Detail_Service**: The service that validates a building code and assembles one Building_Record from public data sources.
- **Displayable_Building_Field**: A non-empty, task-relevant Building_Record field selected for the rail with documented user-facing meaning and Source_Provenance.
- **Source_Provenance**: The source name and freshness information attached to derived or time-sensitive building data.
- **Popular_Building_Set**: A product-curated set of eight Building_Catalog entries; the set does not claim measured popularity.
- **Selected_Building**: The building currently highlighted on the Map_Canvas and represented in the Building_Rail or an AI map widget.
- **Official_Photo**: An image hosted by an allowlisted UBC source or stored as a Reodite-owned asset, with a source link and alt text.
- **Room_Record**: A learning space or library room joined to a Building_Record by an official building code.
- **Availability_Snapshot**: A dated set of room availability intervals whose collection time is visible to the user.
- **Favorite_Service**: The account-scoped service that reads and updates saved building codes.
- **Verified_Entrance**: A current entrance point joined by official building identifier to a Building_Record.
- **Ground_Entrance_Marker**: A ground-plane arrow derived from a Verified_Entrance and a valid nearby building wall segment.
- **Door_Marker**: A door-shaped vertical rectangle derived from a Verified_Entrance and a valid nearby building wall segment.
- **Agent**: The server-side assistant that calls data tools and presentation tools.
- **Map_Widget**: An agent-callable presentation result that renders a map state in the AI_Answer_Canvas and a corresponding Response_Widget in Chat.
- **Building_Detail_Widget**: A Map_Widget for one Building_Record.
- **Building_Entrances_Widget**: A Map_Widget for one building and associated Verified_Entrance records.
- **Building_Spaces_Widget**: A Map_Widget for one building and associated Room_Record entries.
- **Response_Widget**: The keyboard-activatable Chat card that summarizes and restores a Map_Widget.
- **Web_Share**: The browser capability that opens the operating system share sheet for a URL.
- **Wide_Map_Layout**: A Campus_Map_Explorer content width of at least 55rem.
- **Compact_Map_Layout**: A Campus_Map_Explorer content width below 55rem.
- **Authenticated_User**: A signed-in account with a valid user identifier.
- **Guest_User**: A user in Tools_Mode without an authenticated account.

## Requirements

### Requirement 1: Separate Tools and AI map compositions

**User Story:** As a student, I want the map explorer to fit the task I am performing, so that building research does not crowd conversational answers.

#### Acceptance Criteria

1. WHILE Tools_Mode displays Campus Map, THE Campus_Map_Explorer SHALL render the Building_Rail and Map_Canvas.
2. WHILE AI_Mode displays a map, THE AI_Answer_Canvas SHALL render the Map_Canvas without the Building_Rail.
3. WHEN a Map_Widget activates in AI_Mode, THE AI_Answer_Canvas SHALL render the Map_Widget state without mounting Building_Rail controls.
4. WHEN the user switches between Tools_Mode and AI_Mode, THE Campus_Map_Explorer SHALL keep Tools-only search, selection, and rail state out of the AI_Answer_Canvas.

### Requirement 2: Initial building discovery and search

**User Story:** As a student who does not know a building code, I want useful starting places and fast search, so that I can find a destination by familiar words.

#### Acceptance Criteria

1. WHEN the Building_Rail has no query and no Selected_Building, THE Building_Rail SHALL display the eight entries in the Popular_Building_Set.
2. IF an Authenticated_User has saved buildings, THEN THE Building_Rail SHALL display the saved buildings before the Popular_Building_Set.
3. THE Popular_Building_Set SHALL contain only codes that resolve to current Building_Catalog entries.
4. WHEN a user enters a query, THE Building_Rail SHALL match building code, official name, short name, generated alias, and primary address.
5. WHEN a user enters a query, THE Building_Rail SHALL display at most 20 Search_Result rows within 100 milliseconds after the local Building_Catalog is available.
6. WHEN search matches differ in specificity, THE Building_Rail SHALL order exact code matches before alias and prefix matches, and SHALL order remaining matches by official building name.
7. IF no building matches the query, THEN THE Building_Rail SHALL preserve the query and display a no-results state with an action that clears the query.
8. WHEN a user operates the search with a keyboard, THE Building_Rail SHALL support Arrow Up, Arrow Down, Enter, and Escape without moving focus into the Map_Canvas.

### Requirement 3: Synchronized selection and shareable state

**User Story:** As a student, I want the map and building details to stay synchronized, so that every selection has one clear spatial and informational result.

#### Acceptance Criteria

1. WHEN a user selects a Search_Result, THE Campus_Map_Explorer SHALL set the matching building as the Selected_Building.
2. WHEN a user selects a building footprint on the Map_Canvas, THE Campus_Map_Explorer SHALL set the matching building as the Selected_Building.
3. WHEN the Selected_Building changes, THE Map_Canvas SHALL highlight and frame the Selected_Building.
4. WHEN the Selected_Building changes, THE Building_Rail SHALL replace discovery results with details for the Selected_Building.
5. WHEN a user activates the building-detail Back action, THE Building_Rail SHALL restore the prior query and discovery scroll position.
6. WHEN a user opens a valid shared building URL, THE Campus_Map_Explorer SHALL restore the Selected_Building after the Building_Catalog loads.
7. IF a shared building URL contains an unknown code, THEN THE Campus_Map_Explorer SHALL display the discovery state and identify the unmatched code without hiding the Map_Canvas.
8. WHEN building selections overlap in time, THE Campus_Map_Explorer SHALL display details from the latest selection and discard earlier detail responses.

### Requirement 4: Focused and trustworthy building details

**User Story:** As a student, I want one useful building record, so that I can find the destination, rooms, services, entrances, and source information without scanning property-management data.

#### Acceptance Criteria

1. WHEN a Building_Record loads, THE Building_Rail SHALL display task-relevant Displayable_Building_Field values and omit physical property, construction, condition, occupancy, and management metadata.
2. THE Building_Rail SHALL group Displayable_Building_Field values under identity, address, services, rooms and spaces, entrances, and source sections.
3. THE Building_Rail SHALL display the official code, official name, short name, primary address, and postal code when the Building_Record supplies each field.
4. THE Building_Rail SHALL display directly joined points of interest with service type, hours, contact, official URL, and location when the Building_Record supplies each field.
5. THE Building_Rail SHALL display Source_Provenance for derived joins and time-sensitive data.
6. IF a source section contains no Displayable_Building_Field, THEN THE Building_Rail SHALL omit the empty section.
7. IF a raw source field lacks documented user-facing meaning, THEN THE Building_Detail_Service SHALL exclude the raw value from Building_Record presentation fields.
8. IF one associated data source fails, THEN THE Building_Rail SHALL retain successfully loaded building sections and display a retry action for the failed section.

### Requirement 5: Official photos, rooms, and booking data

**User Story:** As a student, I want visual and room information for a building, so that I can recognize the destination and decide whether the available spaces fit my needs.

#### Acceptance Criteria

1. WHERE a Building_Record contains Official_Photo entries, THE Building_Rail SHALL display the Official_Photo entries with alt text and source links.
2. IF an Official_Photo fails to load, THEN THE Building_Rail SHALL remove the broken image surface and retain the image source link.
3. IF a Building_Record contains no Official_Photo, THEN THE Building_Rail SHALL display no fabricated or unrelated building image.
4. WHEN Room_Record entries exist, THE Building_Rail SHALL display every Room_Record with room number or name, room type, capacity, floor, furniture, layout, and official room link when each field exists.
5. WHEN bookable Room_Record entries exist, THE Building_Rail SHALL display the official booking action for each bookable room.
6. WHEN an Availability_Snapshot contains a collection time, THE Building_Rail SHALL label availability with the snapshot collection time.
7. IF an Availability_Snapshot is older than 24 hours, THEN THE Building_Rail SHALL identify availability as historical rather than current.
8. IF an Availability_Snapshot lacks a collection time, THEN THE Building_Rail SHALL identify availability freshness as unknown.
9. IF room data fails while base building data succeeds, THEN THE Building_Rail SHALL preserve base building details and provide a room-section retry action.

### Requirement 6: Building actions and in-app directions

**User Story:** As a student, I want direct actions from a building record, so that I can route, share, save, or continue in an external map without re-entering the destination.

#### Acceptance Criteria

1. WHEN a user activates Directions, THE Building_Rail SHALL keep the Selected_Building as the destination and display editable From and To building boxes at the top.
2. WHEN a user activates either endpoint box, THE Building_Rail SHALL open one endpoint-specific catalog listbox in a bounded native vertical scroll region shared with the sticky endpoint editor, so wheel, touch, and keyboard navigation can reach every result without leaving Directions.
3. WHEN a user selects an endpoint result, THE Building_Rail SHALL commit the building, clear the transient query and listbox, and start route calculation immediately when both endpoints exist.
4. WHEN both endpoint buildings are valid and the routing method is network, THE Map_Canvas SHALL immediately display the complete in-app pedestrian route as a cased primary-colored line above map geometry and below basemap labels, and THE Building_Rail or compact sheet handle SHALL display distance and estimated walking time without another View route action.
5. IF the routing method is estimate, THEN THE Building_Rail SHALL identify the result as a straight-line distance estimate.
6. IF the routing method is estimate, THEN THE Map_Canvas SHALL omit a route line.
7. IF route calculation fails, THEN THE Building_Rail SHALL preserve the origin and destination and display a route retry action.
8. WHEN a user activates Open in Google Maps, THE Campus_Map_Explorer SHALL open a separate Google Maps destination URL using the Selected_Building coordinates.
9. WHEN a user activates Share, THE Campus_Map_Explorer SHALL produce a same-origin URL that restores the Selected_Building.
10. WHERE Web_Share is available, THE Campus_Map_Explorer SHALL offer the shared building URL through Web_Share.
11. IF Web_Share is unavailable or dismissed, THEN THE Campus_Map_Explorer SHALL preserve the Selected_Building and offer clipboard copy without reporting dismissal as an error.
12. IF clipboard copy fails, THEN THE Building_Rail SHALL preserve the Selected_Building and display a retryable copy error.

### Requirement 7: Account-scoped favorite buildings

**User Story:** As a signed-in student, I want saved buildings to follow my account, so that frequent destinations remain available across devices.

#### Acceptance Criteria

1. WHEN an Authenticated_User saves a Selected_Building, THE Favorite_Service SHALL associate the building code with only the Authenticated_User account.
2. WHEN an Authenticated_User removes a saved building, THE Favorite_Service SHALL remove only the matching account and building association.
3. THE Favorite_Service SHALL make repeated save requests and repeated remove requests idempotent.
4. WHEN an Authenticated_User reloads Campus Map on another authenticated device, THE Building_Rail SHALL display the same saved building set.
5. IF a save or remove request fails, THEN THE Building_Rail SHALL restore the prior favorite state and display a retry action.
6. IF a Guest_User activates Save, THEN THE Building_Rail SHALL preserve the Selected_Building and display a sign-in action without creating browser-local favorite state.
7. IF a favorite record references an unknown building code, THEN THE Building_Rail SHALL omit the unmatched favorite from rendered lists.

### Requirement 8: Verified entrance visualization

**User Story:** As a student approaching an unfamiliar building, I want doorway cues on the map, so that I can identify where to enter.

#### Acceptance Criteria

1. THE Campus_Map_Explorer SHALL create entrance graphics only from Verified_Entrance records.
2. WHEN a Verified_Entrance projects to a building wall segment within 4 metres, THE Map_Canvas SHALL render a Ground_Entrance_Marker that points from outside the footprint toward the entrance.
3. WHEN a Verified_Entrance projects to a building wall segment within 4 metres, THE Map_Canvas SHALL render a Door_Marker on the matching 3D building side.
4. THE Door_Marker SHALL align width along the matched wall tangent and height along the vertical axis.
5. THE Door_Marker SHALL use a ground clearance from 0 to 0.2 metres, a height from 1.8 to 2.4 metres, and a width from 0.8 to 1.8 metres.
6. IF a Verified_Entrance cannot project to a building wall segment within 4 metres, THEN THE Campus_Map_Explorer SHALL omit Ground_Entrance_Marker and Door_Marker graphics for the unmatched entrance.
7. IF a building has no Verified_Entrance records, THEN THE Map_Canvas SHALL render the building without entrance graphics.
8. WHILE the Map_Canvas zoom is below level 16 and no building is selected, THE Map_Canvas SHALL hide entrance graphics.
9. WHEN a building becomes the Selected_Building, THE Map_Canvas SHALL render valid entrance graphics for the Selected_Building at the selected-building camera extent.
10. IF entrance accessibility semantics lack source documentation, THEN THE Building_Rail and Map_Canvas SHALL present the entrance without an accessibility claim.

### Requirement 9: Rich AI map widgets

**User Story:** As a student using Chat, I want the agent to show richer spatial answers, so that building, entrance, and room information appears on the map without opening the Tools rail.

#### Acceptance Criteria

1. THE Agent SHALL support Building_Detail_Widget, Building_Entrances_Widget, and Building_Spaces_Widget results in addition to existing building, route, places, and parking Map_Widget results.
2. WHEN a Building_Detail_Widget completes, THE AI_Answer_Canvas SHALL highlight the resolved building.
3. WHEN a Building_Detail_Widget completes, THE Response_Widget SHALL summarize the available Building_Record sections.
4. WHEN a Building_Entrances_Widget completes, THE AI_Answer_Canvas SHALL highlight the resolved building and render valid entrance graphics.
5. WHEN a Building_Spaces_Widget completes, THE AI_Answer_Canvas SHALL highlight the resolved building.
6. WHEN a Building_Spaces_Widget completes, THE Response_Widget SHALL summarize associated Room_Record entries and Availability_Snapshot freshness.
7. WHEN a user activates a map Response_Widget from Chat history, THE AI_Answer_Canvas SHALL restore the corresponding Map_Widget state.
8. WHILE any Map_Widget is active in AI_Mode, THE AI_Answer_Canvas SHALL keep the Building_Rail unmounted.
9. IF a Map_Widget contains an unknown building or malformed spatial data, THEN THE Response_Widget SHALL render an error state and THE AI_Answer_Canvas SHALL preserve the last valid map state.
10. THE Agent tool guidance SHALL identify the data question served by each Map_Widget type.
11. WHEN the Agent calls Building_Detail_Widget, Building_Entrances_Widget, or Building_Spaces_Widget, THE Agent SHALL provide one exact building code returned by a prior building lookup.

### Requirement 10: Responsive, accessible map exploration

**User Story:** As a student using a laptop or phone, I want the same map tasks to remain understandable and operable, so that I can use Campus Map while planning or walking.

#### Acceptance Criteria

1. WHILE Wide_Map_Layout is active, THE Campus_Map_Explorer SHALL render a 20rem Building_Rail beside the Map_Canvas.
2. WHILE Compact_Map_Layout is active, THE Campus_Map_Explorer SHALL keep the Map_Canvas as the main region and expose the Building_Rail through a non-modal Explore bottom-sheet handle with a minimum 44 by 44 pixel target.
3. WHILE Compact_Map_Layout is active, THE Campus_Map_Explorer SHALL keep Map_Canvas state and Building_Rail state mounted while the Explore sheet expands and collapses.
4. WHEN a user selects a building footprint in Compact_Map_Layout, THE Campus_Map_Explorer SHALL expand the Explore bottom sheet with the Selected_Building details.
5. THE Campus_Map_Explorer SHALL expose one level-one page heading.
6. THE Building_Rail SHALL use descending section heading levels below the Campus_Map_Explorer heading.
7. THE Building_Rail SHALL expose search results, selected state, favorite state, loading state, and errors to assistive technology.
8. THE Map_Canvas SHALL remain keyboard focusable and retain text alternatives for selected building, route, place, and entrance state.
9. THE Campus_Map_Explorer SHALL keep document width and height within the viewport at 390 by 844 pixels and 1440 by 900 pixels.
10. WHILE reduced motion is requested, THE Campus_Map_Explorer SHALL apply map camera and region transitions with zero-duration movement while preserving final state feedback.

### Requirement 11: Loading, failure, and stale-response behavior

**User Story:** As a student relying on the map between classes, I want partial failures to stay understandable, so that one missing source does not erase usable map information.

#### Acceptance Criteria

1. WHILE the Building_Catalog loads, THE Campus_Map_Explorer SHALL reserve the final Building_Rail and Map_Canvas geometry.
2. IF the Building_Catalog fails to load, THEN THE Campus_Map_Explorer SHALL display a retry action and keep the Tools shell visible.
3. WHILE a Building_Record loads, THE Building_Rail SHALL keep the Selected_Building identity and action geometry visible.
4. IF a Building_Record fails without any usable section, THEN THE Building_Rail SHALL display a retry action and preserve the Selected_Building map highlight.
5. WHEN a stale Building_Record response arrives after a newer selection, THE Campus_Map_Explorer SHALL discard the stale response.
6. IF Favorite_Service fails to load, THEN THE Building_Rail SHALL keep search and Popular_Building_Set available.
7. IF entrance data fails to load, THEN THE Map_Canvas SHALL preserve building geometry and identify entrance graphics as unavailable.
8. THE Campus_Map_Explorer SHALL produce no unexpected LayoutShift entries during catalog loading, building selection, region switching, or detail resolution at the required test viewports.

### Requirement 12: Public data boundaries and source integrity

**User Story:** As a student, I want map facts to remain trustworthy, so that the interface does not turn incomplete campus data into false certainty.

#### Acceptance Criteria

1. WHILE a Guest_User uses Campus Map, THE Campus_Map_Explorer SHALL load public building, entrance, room, point-of-interest, and route data without account persistence.
2. THE Building_Detail_Service SHALL expose only public UBC data and Reodite-owned account state.
3. THE Building_Detail_Service SHALL join rooms and entrances to buildings through official identifiers.
4. WHERE a spatial containment join supplies a point of interest, THE Building_Detail_Service SHALL identify the association as location-derived.
5. THE Building_Detail_Service SHALL exclude heuristic event, people, food, and department associations from Building_Record facts unless a documented building identifier becomes available.
6. THE Campus_Map_Explorer SHALL display Official_Photo content only from allowlisted UBC hosts or Reodite-owned assets.
7. IF a photo source lacks a durable URL or permitted source classification, THEN THE Building_Detail_Service SHALL omit the photo from Official_Photo results.
8. THE Campus_Map_Explorer SHALL describe the Popular_Building_Set as curated rather than measured.
