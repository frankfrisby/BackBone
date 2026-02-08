# BACKBONE App - Implementation Checklist

Use this checklist to track your progress setting up and deploying the BACKBONE app.

## ✅ Phase 1: Initial Setup

- [ ] **Install Dependencies**
  ```bash
  cd backbone-app
  npm install
  ```
  If this fails due to timeout, try:
  ```bash
  npm install --fetch-timeout=600000
  # or
  yarn install
  ```

- [ ] **Set Up Firebase Project**
  - [ ] Create Firebase project at https://console.firebase.google.com
  - [ ] Enable Google Authentication
  - [ ] Add authorized domain: `localhost`
  - [ ] Get Firebase config credentials
  - [ ] Copy config to `.env.local`

- [ ] **Create Environment File**
  ```bash
  cp .env.example .env.local
  ```
  - [ ] Add Firebase API key
  - [ ] Add Firebase Auth Domain
  - [ ] Add Firebase Project ID
  - [ ] Add Firebase Storage Bucket
  - [ ] Add Firebase Messaging Sender ID
  - [ ] Add Firebase App ID

- [ ] **Test Development Server**
  ```bash
  npm run dev
  ```
  - [ ] App opens at http://localhost:3000
  - [ ] Login page loads correctly
  - [ ] Dark theme is applied
  - [ ] No console errors

## ✅ Phase 2: Authentication

- [ ] **Test Google Sign-In**
  - [ ] Click "Sign in with Google" button
  - [ ] Google popup appears
  - [ ] Can select Google account
  - [ ] Successfully redirects to main app
  - [ ] User avatar shows in sidebar (optional)

- [ ] **Test Sign-Out**
  - [ ] Click sign-out button in sidebar
  - [ ] Redirects to login page
  - [ ] Cannot access main app without auth

## ✅ Phase 3: UI Testing

- [ ] **Chat Interface**
  - [ ] Chat panel appears at bottom (40% height)
  - [ ] Can type messages
  - [ ] Send button works
  - [ ] Messages appear in chat
  - [ ] Mock AI responses work
  - [ ] Can drag chat panel
  - [ ] Swipe left moves chat to right
  - [ ] Swipe right moves chat to left
  - [ ] Auto-scrolls to latest message

- [ ] **Navigation**
  - [ ] Sidebar shows all nav icons
  - [ ] Portfolio icon works
  - [ ] Health icon works
  - [ ] Trading icon works (shows "coming soon")
  - [ ] Calendar icon works (shows "coming soon")
  - [ ] Goals icon works (shows "coming soon")
  - [ ] Active view is highlighted

- [ ] **Portfolio View**
  - [ ] Shows mock portfolio data
  - [ ] Displays total equity
  - [ ] Shows day P/L and total P/L
  - [ ] Displays buying power
  - [ ] Lists stock positions (NVDA, TSLA, AAPL)
  - [ ] Shows P/L with correct colors (green/red)
  - [ ] Buy/Sell buttons visible
  - [ ] Auto-refreshes every 30 seconds

- [ ] **Health View**
  - [ ] Shows readiness score
  - [ ] Displays sleep metrics
  - [ ] Shows activity data
  - [ ] HRV and heart rate visible
  - [ ] Cards have proper styling

## ✅ Phase 4: BACKBONE Backend Integration

- [ ] **Prepare BACKBONE Backend**
  - [ ] BACKBONE backend is running
  - [ ] Running on port 3001 (or update .env.local)
  - [ ] CORS enabled for http://localhost:3000
  - [ ] API endpoints implemented:
    - [ ] POST /api/chat
    - [ ] GET /api/portfolio
    - [ ] GET /api/positions
    - [ ] GET /api/signals
    - [ ] POST /api/trade
    - [ ] GET /api/health/summary

- [ ] **Connect Next.js to Backend**
  - [ ] Update `NEXT_PUBLIC_BACKBONE_API` in `.env.local`
  - [ ] Update `app/api/chat/route.ts` to call real backend
  - [ ] Update `app/api/portfolio/route.ts` to call real backend
  - [ ] Update `app/api/positions/route.ts` to call real backend
  - [ ] Update `app/api/signals/route.ts` to call real backend
  - [ ] Update `app/api/trade/route.ts` to call real backend

- [ ] **Test Integration**
  - [ ] Chat sends messages to BACKBONE AI
  - [ ] Chat receives real AI responses
  - [ ] Portfolio shows real Alpaca data
  - [ ] Positions show actual stocks
  - [ ] Health data comes from Oura
  - [ ] No CORS errors in console

## ✅ Phase 5: Optional Features

- [ ] **Alpaca Trading (Optional)**
  - [ ] Sign up at https://alpaca.markets
  - [ ] Get API keys (use Paper Trading)
  - [ ] Add to `.env.local`
  - [ ] Test direct Alpaca integration

- [ ] **Additional Views**
  - [ ] Implement Trading Signals view
  - [ ] Implement Calendar view
  - [ ] Implement Goals view
  - [ ] Add custom views as needed

- [ ] **Enhancements**
  - [ ] Add WebSocket for real-time updates
  - [ ] Implement push notifications
  - [ ] Add error tracking (Sentry)
  - [ ] Set up analytics
  - [ ] Add loading skeletons
  - [ ] Improve mobile responsiveness

## ✅ Phase 6: Production Deployment

- [ ] **Pre-deployment**
  - [ ] Run `npm run build` successfully
  - [ ] No TypeScript errors
  - [ ] No ESLint errors
  - [ ] Test production build locally: `npm start`
  - [ ] All environment variables documented

- [ ] **Vercel Deployment** (Recommended)
  - [ ] Push code to GitHub
  - [ ] Connect repo to Vercel
  - [ ] Add environment variables in Vercel
  - [ ] Deploy and test
  - [ ] Add production domain to Firebase authorized domains

- [ ] **OR Docker Deployment**
  - [ ] Build Docker image: `docker build -t backbone-app .`
  - [ ] Test locally: `docker run -p 3000:3000 backbone-app`
  - [ ] Deploy to server/cloud
  - [ ] Set up reverse proxy (nginx)
  - [ ] Configure SSL/TLS

- [ ] **Post-deployment**
  - [ ] Test login on production URL
  - [ ] Test all features
  - [ ] Check performance
  - [ ] Monitor errors
  - [ ] Set up backups

## ✅ Phase 7: Documentation & Maintenance

- [ ] **Documentation**
  - [ ] Update README with production URL
  - [ ] Document any custom changes
  - [ ] Create user guide (if needed)
  - [ ] Document API integration details

- [ ] **Monitoring**
  - [ ] Set up error tracking
  - [ ] Configure uptime monitoring
  - [ ] Set up performance monitoring
  - [ ] Create alerts for critical issues

- [ ] **Maintenance Plan**
  - [ ] Schedule dependency updates
  - [ ] Plan for Next.js version upgrades
  - [ ] Monitor Firebase usage/costs
  - [ ] Review and optimize API calls

## 📝 Notes

Use this space for custom notes, issues encountered, or reminders:

```
Date: ___________

Notes:
-
-
-

Issues encountered:
-
-

Solutions:
-
-
```

## 🎯 Quick Status

Current Phase: **___________**

Completion: **_____ %**

Blockers: **___________**

Next Steps:
1. ___________
2. ___________
3. ___________

---

**Last Updated**: ___________
