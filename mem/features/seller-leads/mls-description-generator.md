---
name: MLS Description Generator System
description: Three-column MLS description generator on Seller Lead Detail with Gemini, Claude, and combined final versions, persisted to leads table
type: feature
---

# MLS Description Generator

**Location:** Seller Lead Detail → "Write MLS Description" tab (positioned after Residential Work Sheet, Pencil icon)

## Three Columns
1. **Gemini 2.5 Pro** → saves to `leads.mls_description`
2. **Claude Sonnet 4.5** (`claude-sonnet-4-5-20250929`) → saves to `leads.mls_description_claude`
3. **Combined Final** → saves to `leads.mls_description_final`. Two buttons: "Combine w/ Gemini" and "Combine w/ Claude" — sends both descriptions to chosen model with merge prompt.

## Edge Functions (all `verify_jwt = false`, manual REST auth)
- `generate-mls-description` — Gemini, all photos, full work sheet context
- `generate-mls-description-claude` — Claude, capped at 20 photos (base64-fetched from URLs)
- `tweak-mls-description` — Gemini revise
- `tweak-mls-description-claude` — Claude revise
- `combine-mls-descriptions` — accepts `{ gemini, claude, model: "gemini" | "claude" }`

## Shared Helpers
`supabase/functions/_shared/mls-description.ts` exports:
- `MLS_SYSTEM_PROMPT` — storyteller prompt with hard rules: <1000 chars, no em dashes, no clichés
- `authenticate(req)` — manual REST auth via SUPABASE_SERVICE_ROLE_KEY
- `buildWorkSheetContext(supabase, user, leadId)` — pulls lead + most recent inspection (loose address match), audio_transcriptions summary/transcription, all photos across sections, property facts

## Streaming
All functions stream OpenAI-compatible SSE chunks. Claude's native SSE is translated to `{choices:[{delta:{content}}]}` shape so the single frontend parser in `MLSDescriptionTab.tsx` works for all five functions.

## Persistence
All three columns auto-save on stream completion and on textarea blur. No manual save required (Save button is for explicit re-save).
