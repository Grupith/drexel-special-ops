## Drexel Special Operations Web App

A custom software soulution to save time at work.

# Drexel PO Splitter

A lightweight internal web application designed to automate the process of splitting vendor packing slips into individual Purchase Order (PO) documents for Central Receiving.

---

## Overview

At Drexel Building Supply, receiving often requires splitting a single vendor document into multiple PO-specific pages. This app eliminates manual splitting by automatically detecting PO rows and generating clean, individual documents for each PO.

The goal is simple:  
**Save time, reduce errors, and streamline receiving workflows.**

---

## Features

- Upload a master vendor document (image or scan)
- Automatically detect PO numbers using OCR
- Split document into individual PO images
- Preserve header/footer and handwritten notes
- View generated splits in real-time
- Print individual or all PO documents
- Status tracking (Uploaded → Processing → Completed)

---

## Tech Stack

**Frontend**

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- ShadCN UI

**Backend**

- Firebase (Firestore, Storage, Auth, Functions)
- Google Cloud Vision API (OCR)
- Sharp (image processing)

---

## How It Works

1. User uploads a master document
2. File is stored in Firebase Storage
3. A Cloud Function is triggered
4. OCR scans the document for PO numbers
5. Rows are grouped by PO
6. Images are cropped and saved per PO
7. Sub-splits are written to Firestore
8. UI updates in real-time

---

## Project Structure (Simplified)

```
/app
  /dashboard
  /splitter/[splitId]

/components
  NewSplitModal
  SplitViewPage

/functions
  process-shaw-bol.ts

/firestore
  splits/
    {splitId}
      subSplits/
```

---

## Data Model

### Split

- vendorId
- createdBy
- status (uploaded | processing | completed | failed)
- originalImagePath
- createdAt / updatedAt

### SubSplit

- poNumber
- order
- imagePath
- rowCount
- status (generated)

---

## Status Flow

- **Uploaded** → File successfully stored
- **Processing** → OCR + splitting in progress
- **Completed** → All sub-splits generated
- **Failed** → Error occurred during processing

---

## Future Improvements

- Smarter row detection & alignment
- Support for multiple vendors (beyond SHAW)
- PDF export option
- Batch printing improvements
- PO validation against internal systems
- Search & filtering across splits

---

## Purpose

This project is built specifically to improve efficiency in Drexel’s receiving operations by removing repetitive manual work and speeding up document handling.

---

## Notes

- This is an internal tool and not intended for public use
- Built with a focus on speed, simplicity, and reliability
