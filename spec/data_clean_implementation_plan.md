# Implementation Plan - Virtue Foundation Dataset Cleaning and Management

This plan outlines the architecture and execution steps to clean, standardize, and integrate the three datasets in the `databricks_virtue_foundation_dataset_dais_2026` catalog. The final output will be a set of cleaned, trusted views in the `workspace.default` schema, ready to power a desk research or decision-making application.

## User Review Required

> [!IMPORTANT]
> **Reorganization of Districts & Temporal Mismatch**
> - The NFHS-5 health indicators dataset (2019-2021) uses older district names (e.g., Andhra Pradesh's 13 districts).
> - The PIN code directory contains newer districts created after 2021 (e.g., Andhra Pradesh's 26 districts, Vijayanagar in Karnataka).
> - **Action:** We will implement a mapping layer that maps new districts back to their parent districts in the NFHS-5 dataset to ensure every facility joins correctly with health indicators.

> [!NOTE]
> **Data Quality Issues Identified & Solutions:**
> 1. **Zip Codes:** 239 facilities have malformed zip codes (e.g. containing text like `"ophthalmology"`, lat/long values, spaces, or hyphens). We will use regular expressions to extract clean 6-digit PIN codes.
> 2. **Coordinates:** Several facilities have out-of-bounds coordinates (e.g., negative latitudes, locations outside India). We will impute these using the centroid coordinates of their matched PIN codes.
> 3. **State Names:** There are 254 unique state/region names in the facilities table (which should have at most 36). We will clean them using PIN code lookups and spelling standardizations.
> 4. **Emails:** Many emails contain scraping artifacts like `[email protected]` or the string `"null"`. We will nullify these.
> 5. **Phone Numbers:** Phone numbers are stored as messy JSON arrays. We will extract the first valid phone number as the primary contact number.

## Proposed Changes

We will create three clean views in the `workspace.default` schema to act as the trusted data layer.

---

### Component: Databricks SQL Trusted Views

We will define three SQL DDL views in the `workspace.default` schema.

#### [NEW] [clean_pincodes](file:///Users/lilyfeng/.gemini/antigravity/brain/736632e1-55f2-45d1-a56e-a659c62c6fa9/scratch/clean_pincodes.sql)
A standardized lookup table of Indian postal codes with cleaned coordinates and standardized state names.
- Filters out `'NA'` coordinates and casts them to `double`.
- Normalizes state names to uppercase and standardizes union territories (e.g., standardizing `ANDAMAN AND NICOBAR ISLANDS` and `DELHI`).

#### [NEW] [clean_health_indicators](file:///Users/lilyfeng/.gemini/antigravity/brain/736632e1-55f2-45d1-a56e-a659c62c6fa9/scratch/clean_health_indicators.sql)
A cleaned version of the NFHS-5 district health indicators.
- Trims whitespace from state/UT names.
- Standardizes spelling of states (e.g., `Maharastra` -> `MAHARASHTRA`).
- Casts numeric columns containing `"NA"` strings to float/double.

#### [NEW] [clean_facilities](file:///Users/lilyfeng/.gemini/antigravity/brain/736632e1-55f2-45d1-a56e-a659c62c6fa9/scratch/clean_facilities.sql)
The core facility table cleaned and enriched with official location metadata and linked health indicators.
- Extracts 6-digit PIN code via `regexp_extract`.
- Joins with `clean_pincodes` to assign official state and district names.
- Resolves out-of-bounds coordinates by using the matched PIN code's centroid as fallback.
- Implements a case mapper to align new districts (e.g., `TIRUPATI`, `ELURU`) with their parent districts in NFHS-5 (e.g., `CHITTOOR`, `WEST GODAVARI`).
- Standardizes contact info (nullifies string `"null"` and obfuscated emails, extracts primary phone number).

---

### Component: Automated Pipeline Script

#### [NEW] [run_clean_pipeline.py](file:///Users/lilyfeng/.gemini/antigravity/brain/736632e1-55f2-45d1-a56e-a659c62c6fa9/scratch/run_clean_pipeline.py)
A Python script that executes the SQL statements to deploy/update the cleaned views on the Databricks cluster using the CLI.

---

## Verification Plan

### Automated Verification
We will run queries against the newly created views to verify:
1. **Pincode Match Rate:** Check if we successfully match >95% of facilities to their official pincodes.
2. **State and District Cleanliness:** Count the number of distinct states in the cleaned facilities table (should be <= 36).
3. **Coordinate Bounds:** Verify that no facilities in `clean_facilities` have coordinates outside India.
4. **Health Indicator Join Rate:** Check that every facility in a matched district successfully joins with its corresponding NFHS-5 health indicators.

### Manual Verification
Review random samples of cleaned facilities to confirm spelling standardizations, contact details extraction, and coordinates imputation.
