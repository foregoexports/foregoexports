import * as THREE from 'three';

import {
  OrbitControls
} from 'three/addons/controls/OrbitControls.js';


const API_URL =
  'https://script.google.com/macros/s/AKfycby_cp7uJ6jVVQ4a0cMwhDlpTApxw_9bwzl6vqPlI2k9jUvMtJar33-r8eVUIO_bxX8e/exec';


const SESSION_KEY =
  'forego_container_session';


const COLOURS = [
  '#2F6FEA',
  '#F18722',
  '#2DA66C',
  '#8B65D5',
  '#D95D78',
  '#16A3A8',
  '#D6A11D',
  '#6B7280',
  '#C153A3',
  '#7BAE3A',
  '#E0523A',
  '#0E7C86',
  '#9B6A2F',
  '#B85C9E',
  '#355C9A',
  '#8A9A35'
];


const DIMENSION_UNITS = {
  in: {
    label: 'in',
    toMM: 25.4
  },

  mm: {
    label: 'mm',
    toMM: 1
  },

  cm: {
    label: 'cm',
    toMM: 10
  },

  ft: {
    label: 'ft',
    toMM: 304.8
  }
};


const WEIGHT_UNITS = {
  kg: {
    label: 'kg',
    toKG: 1
  },

  lb: {
    label: 'lb',
    toKG: 0.45359237
  }
};


let sessionToken = '';
let currentUser = null;

let pendingMobile = '';
let pendingOtpRequestId = '';

let containers = [];
let plans = [];

let plan = null;
let items = [];

let packingResult = null;

let scene;
let camera;
let renderer;
let controls;
let cargoGroup;

let autoRotate = false;
let currentView = '3d';

let containerVisualMode = 'cutaway';
let showSceneDimensions = true;
let showOccupancyMarkers = true;
let highlightedItemId = '';

/* Warehouse execution state — tied to the exact physical packing fingerprint. */
let selectedLoadingStepId = '';
let selectedLoadingPlacementIndices = new Set();
let loadingStepCache = [];
let loadingProgressDone = new Set();
let loadingProgressFingerprint = '';

let manualSelectedItemId = '';
let manualGridVisible = false;
let manualGizmoTargets = [];
const openCargoDetailKeys = new Set();
let expandedCargoItemId = '';
const mobileCargoToolState = new Map();
const ONE_FOOT_MM = 304.8;

/* Intuitive quantity controls — local-first, then debounced backend save. */
const quantitySaveTimers = new Map();
const quantitySaveVersions = new Map();

let actionProgressTimer = null;
let actionProgressStartedAt = 0;
let actionProgressDelayTimer = null;
let renderRequested = true;
let refreshFrameId = 0;

function actionLabelFromElement(el) {
  if (!el) return 'Working…';
  const text = (
    el.dataset?.loadingLabel ||
    el.getAttribute?.('aria-label') ||
    el.title ||
    el.textContent ||
    ''
  ).replace(/\s+/g, ' ').trim();
  return text ? (text.length > 34 ? text.slice(0, 34) + '…' : text) : 'Working…';
}

function showActionLoader(title = 'Working…', detail = 'Updating container plan…') {
  const box = document.getElementById('actionProgress');
  if (!box) return;
  clearTimeout(actionProgressTimer);
  clearTimeout(actionProgressDelayTimer);
  actionProgressStartedAt = performance.now();
  const t = document.getElementById('actionProgressTitle');
  const d = document.getElementById('actionProgressDetail');
  if (t) t.textContent = title;
  if (d) d.textContent = detail;
  box.classList.add('show');
  box.setAttribute('aria-hidden', 'false');
}

/*
  Fast-feel loader: local actions get ~140 ms to finish before any spinner appears.
  This avoids flashing a loader for operations that already feel instant while still
  giving feedback for genuinely slower calculations/network actions.
*/
function queueActionLoader(title = 'Working…', detail = 'Updating container plan…', delay = 140) {
  clearTimeout(actionProgressDelayTimer);
  actionProgressDelayTimer = setTimeout(() => showActionLoader(title, detail), delay);
}

function hideActionLoader(minimumVisibleMs = 0) {
  const box = document.getElementById('actionProgress');
  clearTimeout(actionProgressDelayTimer);
  actionProgressDelayTimer = null;
  if (!box) return;
  clearTimeout(actionProgressTimer);
  const wait = box.classList.contains('show')
    ? Math.max(0, minimumVisibleMs - (performance.now() - actionProgressStartedAt))
    : 0;
  actionProgressTimer = setTimeout(() => {
    box.classList.remove('show');
    box.setAttribute('aria-hidden', 'true');
  }, wait);
}

function completeActionLoaderSoon() {
  requestAnimationFrame(() => requestAnimationFrame(() => hideActionLoader(80)));
}

/*
  Start feedback on pointer-down, but only reveal it if the action is not already
  complete after 140 ms. This makes +/−, rotate, view and grid controls feel instant.
*/
document.addEventListener('pointerdown', event => {
  const el = event.target.closest(
    'button, select, input[type="checkbox"], input[type="radio"], input[type="number"], input[type="color"]'
  );
  if (!el || el.disabled) return;
  queueActionLoader(actionLabelFromElement(el), 'Updating container plan…', 140);
  clearTimeout(actionProgressTimer);
  actionProgressTimer = setTimeout(() => hideActionLoader(0), 3000);
}, true);

document.addEventListener('change', event => {
  const el = event.target.closest('select, input');
  if (!el) return;
  queueActionLoader('Applying change…', actionLabelFromElement(el), 140);
}, true);



let productPlacementRules = {};


let loadingStrategy = {
  weightMode: 'auto',
  frontBackMode: 'back-first',
  lateralMode: 'left-first',
  orientationMode: 'auto-mix',
  sequence: []
};



/* =========================================================
   ELEMENTS
========================================================= */

const authScreen =
  document.getElementById('authScreen');

const appShell =
  document.getElementById('appShell');

const mobileForm =
  document.getElementById('mobileForm');

const otpForm =
  document.getElementById('otpForm');

const mobileInput =
  document.getElementById('mobileInput');

const otpInput =
  document.getElementById('otpInput');

const authMessage =
  document.getElementById('authMessage');

const devOtpHint =
  document.getElementById('devOtpHint');

const plansView =
  document.getElementById('plansView');

const plannerView =
  document.getElementById('plannerView');

const plansGrid =
  document.getElementById('plansGrid');

const plansTitle =
  document.getElementById('plansTitle');

const currentUserName =
  document.getElementById('currentUserName');

const currentUserRole =
  document.getElementById('currentUserRole');

const planNumber =
  document.getElementById('planNumber');

const planUpdated =
  document.getElementById('planUpdated');

const containerSelect =
  document.getElementById('containerSelect');

const dimensionUnit =
  document.getElementById('dimensionUnit');

const weightUnit =
  document.getElementById('weightUnit');

const cargoList =
  document.getElementById('cargoList');

const legend =
  document.getElementById('legend');

const fitResults =
  document.getElementById('fitResults');

const packingListBody = document.getElementById('packingListBody');
const packingListFoot = document.getElementById('packingListFoot');
const packingListPanel = document.getElementById('packingListPanel');
const loadingListPanel = document.getElementById('loadingListPanel');
const loadingStepsEl = document.getElementById('loadingSteps');
const planReadiness = document.getElementById('planReadiness');
const loadingProgressText = document.getElementById('loadingProgressText');
const loadingProgressBar = document.getElementById('loadingProgressBar');

const viewer =
  document.getElementById('viewer');

const viewerLoading =
  document.getElementById('viewerLoading');


const globalLoader =
  document.getElementById('globalLoader');

const globalLoaderTitle =
  document.getElementById('globalLoaderTitle');

const globalLoaderMessage =
  document.getElementById('globalLoaderMessage');

const viewerActionLoader =
  document.getElementById('viewerActionLoader');

const viewerActionLoaderText =
  document.getElementById('viewerActionLoaderText');

const appToast =
  document.getElementById('appToast');

let toastTimer = null;


/* =========================================================
   API
========================================================= */

async function apiGet(action, params = {}) {
  const url = new URL(API_URL);

  url.searchParams.set('action', action);

  Object.entries(params).forEach(([key, value]) => {
    if (
      value !== undefined &&
      value !== null
    ) {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString());
  return response.json();
}


async function apiPost(payload) {
  const response = await fetch(
    API_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    }
  );

  return response.json();
}


/* =========================================================
   START
========================================================= */

async function start() {
  bindEvents();

  sessionToken =
    localStorage.getItem(
      SESSION_KEY
    ) || '';

  if (sessionToken) {
    const valid =
      await restoreSession();

    if (valid) {
      await enterApp();
      return;
    }

    localStorage.removeItem(
      SESSION_KEY
    );

    sessionToken = '';
  }

  showLogin();
}


/* =========================================================
   AUTH
========================================================= */

function showLogin() {
  authScreen.classList.remove('hidden');
  appShell.classList.add('hidden');

  mobileForm.classList.remove('hidden');
  otpForm.classList.add('hidden');

  authMessage.textContent = '';
  devOtpHint.classList.add('hidden');
}


async function restoreSession() {
  try {
    const result =
      await apiPost({
        action: 'validateSession',
        sessionToken
      });

    if (
      !result.ok ||
      !result.authenticated
    ) {
      return false;
    }

    currentUser = result.user;

    return true;

  } catch (error) {
    console.error(
      'Session validation failed',
      error
    );

    return false;
  }
}


async function requestOtp() {
  authMessage.textContent = '';

  let mobile =
    String(
      mobileInput.value || ''
    )
      .replace(/\D/g, '')
      .trim();

  if (
    mobile.length !== 10
  ) {
    authMessage.textContent =
      'Enter a valid 10-digit mobile number.';

    return;
  }

  pendingMobile = '91' + mobile;

  setButtonBusy(
    'sendOtpBtn',
    true,
    'Sending...'
  );

  try {
    const result =
      await apiPost({
        action: 'requestOtp',
        mobile: pendingMobile
      });

    if (!result.ok) {
      authMessage.textContent =
        result.message ||
        'Unable to send OTP.';

      return;
    }

    pendingOtpRequestId =
      result.otpRequestId;

    mobileForm.classList.add('hidden');
    otpForm.classList.remove('hidden');

    document
      .getElementById('otpMobileLabel')
      .textContent =
        `+91 ${mobile}`;

    otpInput.value = '';
    otpInput.focus();

    if (result.testOtp) {
      devOtpHint.textContent =
        `Development OTP: ${result.testOtp}`;

      devOtpHint.classList.remove('hidden');
    } else {
      devOtpHint.classList.add('hidden');
    }

  } catch (error) {
    console.error(error);

    authMessage.textContent =
      'Unable to contact the login service.';

  } finally {
    setButtonBusy(
      'sendOtpBtn',
      false,
      'Continue'
    );
  }
}


async function verifyOtp() {
  authMessage.textContent = '';

  const otp =
    String(
      otpInput.value || ''
    )
      .replace(/\D/g, '')
      .trim();

  if (otp.length !== 6) {
    authMessage.textContent =
      'Enter the 6-digit OTP.';

    return;
  }

  setButtonBusy(
    'verifyOtpBtn',
    true,
    'Verifying...'
  );

  try {
    const result =
      await apiPost({
        action: 'verifyOtp',
        mobile: pendingMobile,
        otpRequestId: pendingOtpRequestId,
        otp,
        deviceLabel:
          `${navigator.platform || 'Browser'} · ${navigator.userAgent.includes('Chrome') ? 'Chrome' : 'Web'}`
      });

    if (
      !result.ok ||
      !result.authenticated
    ) {
      authMessage.textContent =
        result.message ||
        'Unable to verify OTP.';

      return;
    }

    sessionToken = result.sessionToken;
    currentUser = result.user;

    localStorage.setItem(
      SESSION_KEY,
      sessionToken
    );

    await enterApp();

  } catch (error) {
    console.error(error);

    authMessage.textContent =
      'Unable to verify OTP.';

  } finally {
    setButtonBusy(
      'verifyOtpBtn',
      false,
      'Verify & Continue'
    );
  }
}


async function logout() {
  try {
    if (sessionToken) {
      await apiPost({
        action: 'logout',
        sessionToken
      });
    }
  } catch (error) {
    console.warn(
      'Logout request failed',
      error
    );
  }

  localStorage.removeItem(
    SESSION_KEY
  );

  sessionToken = '';
  currentUser = null;
  plan = null;
  items = [];

  showLogin();
}


/* =========================================================
   ENTER APP
========================================================= */

async function enterApp() {
  showGlobalLoader(
    'Loading your plans…',
    'Preparing your saved container plans.'
  );

  authScreen.classList.add('hidden');
  appShell.classList.remove('hidden');

  currentUserName.textContent =
    currentUser?.name || 'User';

  currentUserRole.textContent =
    currentUser?.role || 'User';

  if (
    String(
      currentUser?.accessLevel || ''
    ).toUpperCase() === 'ALL'
  ) {
    plansTitle.textContent =
      'All Loading Plans';
  } else {
    plansTitle.textContent =
      'My Loading Plans';
  }

  if (!containers.length) {
    await loadContainers();
  }

  if (!renderer) {
    initThree();
  }

  await loadPlans();

  showPlansView();

  hideGlobalLoader();
}


/* =========================================================
   PLANS LIST
========================================================= */

async function loadPlans() {
  plansGrid.innerHTML =
    `
    <div class="empty-state">
      Loading saved plans...
    </div>
    `;

  const result =
    await apiGet(
      'getPlans',
      {
        sessionToken
      }
    );

  if (!result.ok) {
    if (
      String(
        result.message || ''
      ).includes('Authentication')
    ) {
      await logout();
      return;
    }

    plansGrid.innerHTML =
      `
      <div class="empty-state">
        ${escapeHtml(
          result.message ||
          'Unable to load plans.'
        )}
      </div>
      `;

    return;
  }

  plans = result.plans || [];
  renderPlans();
}


function renderPlans() {
  if (!plans.length) {
    plansGrid.innerHTML =
      `
      <div class="empty-state">
        No loading plans yet. Create your first plan.
      </div>
      `;

    return;
  }

  plansGrid.innerHTML = '';

  plans.forEach(savedPlan => {
    const container =
      containers.find(
        c =>
          c.Container_ID ===
          savedPlan.Container_Type
      );

    const card =
      document.createElement(
        'article'
      );

    card.className = 'plan-card';

    card.innerHTML =
      `
      <div class="plan-card-top">
        <div class="plan-card-id">
          ${escapeHtml(savedPlan.Plan_ID)}
        </div>

        <div class="plan-status">
          ${escapeHtml(
            savedPlan.Status || 'Draft'
          )}
        </div>
      </div>

      <div class="plan-card-meta">
        <div>
          Container
          <strong>
            ${escapeHtml(
              container?.Container_Name ||
              savedPlan.Container_Type ||
              '—'
            )}
          </strong>
        </div>

        <div>
          Packages
          <strong>
            ${formatNumber(
              savedPlan.Total_Packages
            )}
          </strong>
        </div>

        <div>
          Volume Used
          <strong>
            ${formatDecimal(
              savedPlan.Container_Volume_Used_Pct,
              1
            )}%
          </strong>
        </div>

        <div>
          Updated
          <strong>
            ${formatShortDate(
              savedPlan.Updated_At ||
              savedPlan.Created_At
            )}
          </strong>
        </div>
      </div>

      <button
        class="primary-btn open-plan"
        type="button"
      >
        Open Plan
      </button>
      `;

    card
      .querySelector('.open-plan')
      .addEventListener(
        'click',
        () =>
          withButtonLoader(
            card.querySelector('.open-plan'),
            'Opening…',
            () =>
              openPlan(
                savedPlan.Plan_ID
              )
          )
      );

    plansGrid.appendChild(card);
  });
}


function showPlansView() {
  plannerView.classList.add('hidden');
  plansView.classList.remove('hidden');
}


function showPlannerView() {
  plansView.classList.add('hidden');
  plannerView.classList.remove('hidden');

  setTimeout(
    resizeViewer,
    60
  );
}


/* =========================================================
   CONTAINERS
========================================================= */

async function loadContainers() {
  const data =
    await apiGet(
      'getContainers'
    );

  if (!data.ok) {
    throw new Error(
      data.message
    );
  }

  containers =
    data.containers || [];

  containerSelect.innerHTML =
    containers
      .map(container => `
        <option
          value="${escapeHtml(
            container.Container_ID
          )}"
        >
          ${escapeHtml(
            container.Container_Name
          )}
        </option>
      `)
      .join('');
}


/* =========================================================
   CREATE / OPEN PLAN
========================================================= */

async function createNewPlan() {
  if (!sessionToken) {
    return;
  }

  showGlobalLoader(
    'Creating new plan…',
    'Setting up container and defaults.'
  );

  const container =
    containers[0];

  if (!container) {
    hideGlobalLoader();

    alert(
      'No container preset is available.'
    );

    return;
  }

  const result =
    await apiPost({
      action: 'createPlan',
      sessionToken,
      Container_Type:
        container.Container_ID,
      Dimension_Unit: 'in',
      Weight_Unit: 'kg'
    });

  if (!result.ok) {
    hideGlobalLoader();

    alert(
      result.message ||
      'Unable to create plan.'
    );

    return;
  }

  await openPlan(
    result.planId
  );

  await loadPlans();

  hideGlobalLoader();

  showToast(
    'New loading plan created.'
  );
}


async function openPlan(planId) {
  showGlobalLoader(
    'Opening plan…',
    'Loading container, cargo and saved settings.'
  );

  const data =
    await apiGet(
      'getPlan',
      {
        planId,
        sessionToken
      }
    );

  if (!data.ok) {
    hideGlobalLoader();

    alert(
      data.message ||
      'Unable to open plan.'
    );

    return;
  }

  plan = data.plan;
  items = data.items || [];

  loadProductPlacementRules();
  ensureProductPlacementRules();

  loadStrategyForPlan();
  ensureStrategySequence();
  renderStrategyControls();

  planNumber.textContent =
    plan.Plan_ID;

  planUpdated.textContent =
    `Updated ${formatShortDateTime(
      plan.Updated_At ||
      plan.Created_At
    )}`;

  containerSelect.value =
    plan.Container_Type ||
    containers[0]?.Container_ID ||
    '';

  dimensionUnit.value =
    plan.Dimension_Unit || 'in';

  weightUnit.value =
    plan.Weight_Unit || 'kg';

  updateCargoLabels();
  refreshEverything();
  showPlannerView();

  hideGlobalLoader();
}


/* =========================================================
   SAVE PLAN SETTINGS
========================================================= */

async function savePlanSettings() {
  if (!plan) {
    return;
  }

  showViewerLoader(
    'Updating container settings…'
  );

  setAutosaveState(
    'saving'
  );

  const result =
    await apiPost({
      action: 'updatePlan',
      sessionToken,
      Plan_ID:
        plan.Plan_ID,
      Container_Type:
        containerSelect.value,
      Dimension_Unit:
        dimensionUnit.value,
      Weight_Unit:
        weightUnit.value
    });

  if (result.ok) {
    plan.Container_Type =
      containerSelect.value;

    plan.Dimension_Unit =
      dimensionUnit.value;

    plan.Weight_Unit =
      weightUnit.value;

    setAutosaveState(
      'saved'
    );

  } else {
    setAutosaveState(
      'error'
    );

    showToast(
      'Unable to save plan settings.',
      'error'
    );
  }

  hideViewerLoader();
}


/* =========================================================
   CARGO MODAL
========================================================= */

const cargoModal =
  document.getElementById('cargoModal');

const cargoForm =
  document.getElementById('cargoForm');

const cargoItemId =
  document.getElementById('cargoItemId');

const cargoModalTitle =
  document.getElementById('cargoModalTitle');


function openNewCargoModal() {
  if (!plan) {
    return;
  }

  cargoForm.reset();
  cargoItemId.value = '';

  document
    .getElementById('cargoRotate')
    .checked = true;

  document
    .getElementById('cargoStackable')
    .checked = true;

  document
    .getElementById('cargoMaxLayers')
    .value = 0;

  cargoModalTitle.textContent =
    'Add Product';

  updateCargoLabels();

  cargoModal.classList.remove(
    'hidden'
  );
}


function closeCargoModal() {
  cargoModal.classList.add(
    'hidden'
  );
}


/* =========================================================
   SAVE CARGO
========================================================= */

async function saveCargo(event) {
  event.preventDefault();

  const editingId =
    cargoItemId.value;

  const existing =
    items.find(
      item =>
        item.Item_ID ===
        editingId
    );

  const payload = {
    action:
      editingId
        ? 'updateItem'
        : 'addItem',

    sessionToken,
    Plan_ID:
      plan.Plan_ID,

    Product_Name:
      document
        .getElementById('cargoProduct')
        .value
        .trim(),

    Packing_Type:
      document
        .getElementById('cargoPackingType')
        .value,

    Quantity:
      Number(
        document
          .getElementById('cargoQuantity')
          .value
      ),

    Length_mm:
      dimensionToMM(
        document
          .getElementById('cargoLength')
          .value
      ),

    Width_mm:
      dimensionToMM(
        document
          .getElementById('cargoWidth')
          .value
      ),

    Height_mm:
      dimensionToMM(
        document
          .getElementById('cargoHeight')
          .value
      ),

    Gross_Weight_Kg:
      weightToKG(
        document
          .getElementById('cargoWeight')
          .value
      ),

    Box_Thickness_mm: 0,

    Max_Layers:
      Number(
        document
          .getElementById('cargoMaxLayers')
          .value || 0
      ),

    Rotate_Horizontal:
      document
        .getElementById('cargoRotate')
        .checked,

    Turn_Sideways:
      document
        .getElementById('cargoSideways')
        .checked,

    Turn_Upside_Down:
      document
        .getElementById('cargoUpside')
        .checked,

    Stackable:
      document
        .getElementById('cargoStackable')
        .checked,

    Colour:
      existing?.Colour ||
      chooseColour(),

    Loading_Order:
      existing?.Loading_Order ||
      items.length + 1
  };

  if (editingId) {
    payload.Item_ID =
      editingId;
  }

  showViewerLoader(
    editingId
      ? 'Updating cargo…'
      : 'Adding cargo…'
  );

  showViewerLoader(
    'Recalculating box orientation…'
  );

  setAutosaveState('saving');

  const result =
    await apiPost(payload);

  if (!result.ok) {
    setAutosaveState('error');

    hideViewerLoader();

    alert(
      result.message ||
      'Unable to save cargo.'
    );

    return;
  }

  closeCargoModal();

  await reloadPlan();
  await loadPlans();

  setAutosaveState('saved');

  hideViewerLoader();

  showToast(
    editingId
      ? 'Cargo updated.'
      : 'Cargo added.'
  );
}


/* =========================================================
   QUICK ORIENTATION CONTROLS
========================================================= */

async function setOrientation(
  itemId,
  mode
) {
  const item =
    items.find(
      cargo =>
        cargo.Item_ID ===
        itemId
    );

  if (!item) {
    return;
  }

  const previousState = {
    Rotate_Horizontal:
      item.Rotate_Horizontal,

    Turn_Sideways:
      item.Turn_Sideways,

    Turn_Upside_Down:
      item.Turn_Upside_Down
  };

  const beforeFit =
    getItemFitResult(
      itemId
    );

  /*
    IMPORTANT:
    Auto Mix is encoded by BOTH existing backend flags being true.
    No new Google Sheet column or Apps Script change is required.
  */

  if (mode === 'default') {
    item.Rotate_Horizontal =
      false;

    item.Turn_Sideways =
      false;
  }

  if (mode === 'rotate') {
    item.Rotate_Horizontal =
      true;

    item.Turn_Sideways =
      false;
  }

  if (mode === 'sideways') {
    item.Rotate_Horizontal =
      false;

    item.Turn_Sideways =
      true;
  }

  if (mode === 'auto') {
    item.Rotate_Horizontal =
      true;

    item.Turn_Sideways =
      true;
  }

  if (mode === 'upside') {
    item.Turn_Upside_Down =
      !toBoolean(
        item.Turn_Upside_Down
      );
  }

  /*
    Recalculate locally FIRST.
    This makes the 3D view and fitted quantity change immediately.
  */
  refreshEverything();

  const afterFit =
    getItemFitResult(
      itemId
    );

  showOrientationFeedback(
    item,
    beforeFit,
    afterFit,
    mode
  );

  setAutosaveState(
    'saving'
  );

  const payload = {
    action:
      'updateItem',

    sessionToken,

    Item_ID:
      itemId,

    Rotate_Horizontal:
      toBoolean(
        item.Rotate_Horizontal
      ),

    Turn_Sideways:
      toBoolean(
        item.Turn_Sideways
      ),

    Turn_Upside_Down:
      toBoolean(
        item.Turn_Upside_Down
      )
  };

  try {
    const result =
      await apiPost(
        payload
      );

    if (!result.ok) {
      throw new Error(
        result.message ||
        'Unable to save orientation.'
      );
    }

    setAutosaveState(
      'saved'
    );

  } catch (error) {
    item.Rotate_Horizontal =
      previousState.Rotate_Horizontal;

    item.Turn_Sideways =
      previousState.Turn_Sideways;

    item.Turn_Upside_Down =
      previousState.Turn_Upside_Down;

    refreshEverything();

    setAutosaveState(
      'error'
    );

    showToast(
      error.message ||
      'Orientation save failed.',
      'error',
      3500
    );
  }
}


function getItemFitResult(
  itemId
) {
  const result =
    packingResult ||
    calculatePacking();

  return (
    result.results.find(
      row =>
        row.item.Item_ID ===
        itemId
    ) ||
    null
  );
}


function showOrientationFeedback(
  item,
  beforeFit,
  afterFit,
  mode
) {
  if (mode === 'upside') {
    showToast(
      toBoolean(
        item.Turn_Upside_Down
      )
        ? 'Upside-down handling enabled.'
        : 'Upside-down handling disabled.'
    );

    return;
  }

  const before =
    Number(
      beforeFit?.fitted ||
      0
    );

  const after =
    Number(
      afterFit?.fitted ||
      0
    );

  const delta =
    after -
    before;

  const modeName = {
    default:
      'Default',

    rotate:
      'Floor Rotate',

    sideways:
      'Sideways',

    auto:
      'Auto Mix'
  }[mode] ||
  'Orientation';

  const mixCount =
    afterFit?.breakdown
      ?.length ||
    0;

  if (
    mode ===
    'auto' &&
    mixCount >
    1
  ) {
    const mix =
      afterFit.breakdown
        .map(
          entry =>
            `${entry.count} ${entry.type === 'default' ? 'default' : entry.type === 'floor' ? 'floor-rotated' : 'sideways'}`
        )
        .join(' · ');

    showToast(
      `Auto Mix: fits ${formatNumber(after)} · ${mix}`,
      delta >= 0
        ? 'success'
        : 'warning',
      4200
    );

    return;
  }

  if (delta > 0) {
    showToast(
      `${modeName}: fits ${formatNumber(after)} · +${formatNumber(delta)} more package${delta === 1 ? '' : 's'}.`,
      'success',
      3200
    );

    return;
  }

  if (delta < 0) {
    showToast(
      `${modeName}: fits ${formatNumber(after)} · ${formatNumber(Math.abs(delta))} fewer.`,
      'warning',
      3200
    );

    return;
  }

  showToast(
    `${modeName}: fits ${formatNumber(after)} package${after === 1 ? '' : 's'}.`,
    'success',
    2200
  );
}


async function setProductColour(
  itemId,
  colour
) {
  const item =
    items.find(
      cargo =>
        cargo.Item_ID ===
        itemId
    );

  if (!item) {
    return;
  }

  const chosen =
    String(
      colour ||
      ''
    ).toUpperCase();

  const collision =
    items.find(
      cargo =>
        cargo.Item_ID !==
          itemId &&
        String(
          displayColour(
            cargo
          )
        ).toUpperCase() ===
          chosen
    );

  if (collision) {
    showToast(
      `That colour is already used by ${collision.Product_Name}. Choose a different colour.`,
      'warning',
      3500
    );

    renderCargoList();
    return;
  }

  const previous =
    item.Colour;

  item.Colour =
    colour;

  item._DisplayColour =
    colour;

  refreshEverything();

  setAutosaveState(
    'saving'
  );

  try {
    const result =
      await apiPost({
        action:
          'updateItem',

        sessionToken,

        Item_ID:
          itemId,

        Colour:
          colour
      });

    if (!result.ok) {
      throw new Error(
        result.message ||
        'Unable to save colour.'
      );
    }

    setAutosaveState(
      'saved'
    );

    showToast(
      'Product colour updated.'
    );

  } catch (error) {
    item.Colour =
      previous;

    delete item._DisplayColour;

    refreshEverything();

    setAutosaveState(
      'error'
    );

    showToast(
      error.message ||
      'Unable to save colour.',
      'error'
    );
  }
}


function toggleProductFocus(
  itemId
) {
  highlightedItemId =
    highlightedItemId ===
      itemId
      ? ''
      : itemId;

  renderCargoList();

  renderLegend();

  render3D(
    packingResult
  );
}


/* =========================================================
   EDIT / DELETE
========================================================= */

function editCargo(itemId) {
  const item =
    items.find(
      cargo =>
        cargo.Item_ID ===
        itemId
    );

  if (!item) {
    return;
  }

  cargoItemId.value =
    item.Item_ID;

  cargoModalTitle.textContent =
    'Edit Product';

  setValue(
    'cargoProduct',
    item.Product_Name
  );

  setValue(
    'cargoPackingType',
    item.Packing_Type
  );

  setValue(
    'cargoQuantity',
    item.Quantity
  );

  setValue(
    'cargoLength',
    dimensionFromMM(
      item.Length_mm
    )
  );

  setValue(
    'cargoWidth',
    dimensionFromMM(
      item.Width_mm
    )
  );

  setValue(
    'cargoHeight',
    dimensionFromMM(
      item.Height_mm
    )
  );

  setValue(
    'cargoWeight',
    weightFromKG(
      item.Gross_Weight_Kg
    )
  );

  setValue(
    'cargoMaxLayers',
    item.Max_Layers
  );

  document
    .getElementById('cargoRotate')
    .checked =
      toBoolean(
        item.Rotate_Horizontal
      );

  document
    .getElementById('cargoSideways')
    .checked =
      toBoolean(
        item.Turn_Sideways
      );

  document
    .getElementById('cargoUpside')
    .checked =
      toBoolean(
        item.Turn_Upside_Down
      );

  document
    .getElementById('cargoStackable')
    .checked =
      toBoolean(
        item.Stackable
      );

  updateCargoLabels();

  cargoModal.classList.remove(
    'hidden'
  );
}


async function deleteCargo(itemId) {
  const item =
    items.find(
      cargo =>
        cargo.Item_ID ===
        itemId
    );

  if (!item) {
    return;
  }

  if (
    !confirm(
      `Remove "${item.Product_Name}"?`
    )
  ) {
    return;
  }

  showViewerLoader(
    'Removing cargo…'
  );

  setAutosaveState('saving');

  const result =
    await apiPost({
      action: 'deleteItem',
      Item_ID: itemId,
      sessionToken
    });

  if (!result.ok) {
    setAutosaveState('error');
    hideViewerLoader();
    alert(result.message);
    return;
  }

  await reloadPlan();
  await loadPlans();

  setAutosaveState('saved');

  hideViewerLoader();

  showToast(
    'Cargo removed.'
  );
}


/* =========================================================
   RELOAD PLAN
========================================================= */

async function reloadPlan() {
  if (!plan) {
    return;
  }

  const data =
    await apiGet(
      'getPlan',
      {
        planId:
          plan.Plan_ID,
        sessionToken
      }
    );

  if (!data.ok) {
    throw new Error(
      data.message
    );
  }

  plan = data.plan;
  items = data.items || [];

  planUpdated.textContent =
    `Updated ${formatShortDateTime(
      plan.Updated_At ||
      plan.Created_At
    )}`;

  refreshEverything();
}



/* =========================================================
   PACKING LIST + FOOLPROOF LOADING SEQUENCE
========================================================= */
function packingFingerprint(result) {
  let hash = 2166136261;
  const feed = value => { const text = String(value); for (let i=0;i<text.length;i++){ hash ^= text.charCodeAt(i); hash = Math.imul(hash,16777619); } };
  (result?.placements || []).forEach(p => { feed(p.itemId); feed(Math.round(p.x)); feed(Math.round(p.y)); feed(Math.round(p.z)); feed(Math.round(p.l)); feed(Math.round(p.w)); feed(Math.round(p.h)); feed(p.orientationKey || ''); });
  return `${(result?.placements || []).length}-${(hash>>>0).toString(36)}`;
}
function loadingProgressStorageKey(){ return `forego_loading_progress_${plan?.Plan_ID || 'draft'}`; }
function loadLoadingProgress(result){
  const fingerprint=packingFingerprint(result); if(fingerprint===loadingProgressFingerprint)return;
  loadingProgressFingerprint=fingerprint; loadingProgressDone=new Set();
  try{ const saved=JSON.parse(localStorage.getItem(loadingProgressStorageKey())||'{}'); if(saved.fingerprint===fingerprint&&Array.isArray(saved.done))loadingProgressDone=new Set(saved.done); }catch(_){}
}
function saveLoadingProgress(){ try{localStorage.setItem(loadingProgressStorageKey(),JSON.stringify({fingerprint:loadingProgressFingerprint,done:[...loadingProgressDone]}));}catch(_){} }
function longitudinalZoneLabel(centerX,L){const r=L>0?centerX/L:0;if(r<.18)return'BACK';if(r<.40)return'REAR';if(r<.62)return'MIDDLE';if(r<.84)return'FRONT';return'DOORS';}
function widthZoneLabel(centerY,W){const r=W>0?centerY/W:.5;if(r<.34)return'LEFT';if(r>.66)return'RIGHT';return'CENTRE';}
function buildLoadingSteps(result){
  const container=selectedContainer(); const L=Number(container?.Internal_Length_mm||0),W=Number(container?.Internal_Width_mm||0),bayDepth=3*ONE_FOOT_MM; const groups=new Map();
  (result?.placements||[]).forEach((p,index)=>{const item=items.find(i=>i.Item_ID===p.itemId);if(!item)return;const cx=p.x+p.l/2,cy=p.y+p.w/2,bay=Math.max(0,Math.floor(cx/bayDepth)),verticalBand=Math.max(0,Math.floor((p.z+1)/ONE_FOOT_MM)),side=widthZoneLabel(cy,W),key=[bay,verticalBand,p.itemId,p.orientationKey||p.orientationType||'default',side].join('|');
    if(!groups.has(key))groups.set(key,{key,bay,verticalBand,item,orientation:p.orientationType||'default',orientationKey:p.orientationKey||'',indices:[],placements:[],minX:Infinity,maxX:0,minZ:Infinity,maxZ:0,centerYTotal:0});
    const g=groups.get(key);g.indices.push(index);g.placements.push(p);g.minX=Math.min(g.minX,p.x);g.maxX=Math.max(g.maxX,p.x+p.l);g.minZ=Math.min(g.minZ,p.z);g.maxZ=Math.max(g.maxZ,p.z+p.h);g.centerYTotal+=cy;
  });
  return [...groups.values()].sort((a,b)=>a.bay-b.bay||a.verticalBand-b.verticalBand||Number(a.item.Loading_Order||9999)-Number(b.item.Loading_Order||9999)||a.minX-b.minX).map((g,idx)=>{const qty=g.indices.length,kg=qty*Number(g.item.Gross_Weight_Kg||0),avgY=g.centerYTotal/Math.max(1,qty),zone=longitudinalZoneLabel((g.minX+g.maxX)/2,L),side=widthZoneLabel(avgY,W),fromFt=g.minX/ONE_FOOT_MM,toFt=g.maxX/ONE_FOOT_MM,floor=g.minZ<8,level=floor?'FLOOR':`UPPER @ ${(g.minZ/ONE_FOOT_MM).toFixed(1)} ft`,orientation=g.orientation==='floor'?'Floor / rotated':g.orientation==='side'?'Sideways':'Default';return{...g,step:idx+1,id:`S${idx+1}-${g.key}`,qty,kg,zone,side,fromFt,toFt,level,orientation};});
}
function renderPackingAndLoadingLists(result){
  if(!packingListBody||!loadingStepsEl)return;loadLoadingProgress(result);const resultMap=new Map((result?.results||[]).map(r=>[r.item.Item_ID,r]));let reqTotal=0,plannedTotal=0,shortTotal=0,weightTotal=0,cbmTotal=0;
  packingListBody.innerHTML=items.map((item,index)=>{const row=resultMap.get(item.Item_ID),requested=Number(row?.requested??item.Quantity??0),planned=Number(row?.fitted||0),short=Math.max(0,requested-planned),unitKg=Number(item.Gross_Weight_Kg||0),totalKg=planned*unitKg,unitCBM=Number(item.Length_mm||0)*Number(item.Width_mm||0)*Number(item.Height_mm||0)/1e9,totalCBM=planned*unitCBM;reqTotal+=requested;plannedTotal+=planned;shortTotal+=short;weightTotal+=totalKg;cbmTotal+=totalCBM;
    return `<tr><td>${index+1}</td><td><div class="ops-product"><span class="colour-dot" style="background:${escapeHtml(displayColour(item))}"></span>${escapeHtml(item.Product_Name)}</div></td><td>${escapeHtml(item.Packing_Type||'—')}</td><td><strong>${formatNumber(requested)}</strong></td><td><strong>${formatNumber(planned)}</strong></td><td>${short?`<strong>${formatNumber(short)}</strong>`:'—'}</td><td>${formatDimension(item.Length_mm)} × ${formatDimension(item.Width_mm)} × ${formatDimension(item.Height_mm)} ${dimensionLabel()}</td><td>${formatDecimal(weightFromKG(unitKg),2)} ${weightLabel()}</td><td><strong>${formatDecimal(weightFromKG(totalKg),2)} ${weightLabel()}</strong></td><td>${formatDecimal(totalCBM,3)}</td><td><span class="ops-status ${short?'short':'ok'}">${short?'SHORT':'READY'}</span></td></tr>`;}).join('')||`<tr><td colspan="11" class="empty-ops">Add cargo to create the packing list.</td></tr>`;
  packingListFoot.innerHTML=`<tr><td colspan="3">TOTAL</td><td>${formatNumber(reqTotal)}</td><td>${formatNumber(plannedTotal)}</td><td>${shortTotal?formatNumber(shortTotal):'—'}</td><td></td><td></td><td>${formatDecimal(weightFromKG(weightTotal),2)} ${weightLabel()}</td><td>${formatDecimal(cbmTotal,3)}</td><td>${shortTotal?'CHECK':'READY'}</td></tr>`;
  const payloadExceeded=Number(result?.maxPayloadKG||0)>0&&Number(result?.loadedPayloadKG||0)>Number(result.maxPayloadKG)+.001,ready=shortTotal===0&&!payloadExceeded&&plannedTotal>0;planReadiness.className=`plan-readiness ${ready?'ready':'warning'}`;planReadiness.innerHTML=`<div class="readiness-main"><span class="readiness-badge">${ready?'READY TO LOAD':'REVIEW REQUIRED'}</span><strong>${ready?'All requested packages are physically planned within payload.':shortTotal?`${formatNumber(shortTotal)} requested package(s) are not in the physical plan.`:'Add cargo or review container capacity.'}</strong></div><div class="readiness-stats">${formatNumber(plannedTotal)} pkgs · ${formatDecimal(weightFromKG(weightTotal),2)} ${weightLabel()} · ${formatDecimal(cbmTotal,2)} CBM</div>`;
  loadingStepCache=buildLoadingSteps(result);const validIds=new Set(loadingStepCache.map(s=>s.id));loadingProgressDone=new Set([...loadingProgressDone].filter(id=>validIds.has(id)));if(selectedLoadingStepId&&!validIds.has(selectedLoadingStepId)){selectedLoadingStepId='';selectedLoadingPlacementIndices=new Set();}
  loadingStepsEl.innerHTML=loadingStepCache.map(step=>{const done=loadingProgressDone.has(step.id),selected=selectedLoadingStepId===step.id;return `<div class="loading-step ${done?'done':''} ${selected?'selected':''}" data-step-id="${escapeHtml(step.id)}" role="button" tabindex="0"><div class="step-number">${String(step.step).padStart(2,'0')}</div><div class="step-product"><span class="colour-dot" style="background:${escapeHtml(displayColour(step.item))}"></span><div class="step-meta"><span>Product</span><strong>${escapeHtml(step.item.Product_Name)}</strong></div></div><div class="step-meta step-location"><span>Position</span><strong class="step-zone">${step.zone} · ${step.side}</strong><small>${step.fromFt.toFixed(1)}–${step.toFt.toFixed(1)} ft from back · ${step.level}</small></div><div class="step-meta step-orientation"><span>Orientation</span><strong>${escapeHtml(step.orientation)}</strong></div><div class="step-meta step-weight"><span>Load</span><strong>${formatNumber(step.qty)} pkgs · ${formatDecimal(weightFromKG(step.kg),1)} ${weightLabel()}</strong></div><label class="step-check"><input class="loading-step-check" type="checkbox" data-step-id="${escapeHtml(step.id)}" ${done?'checked':''}> Loaded</label></div>`;}).join('')||`<div class="empty-ops">The loading sequence will appear when cargo is physically placed.</div>`;updateLoadingProgressUI();
}
function updateLoadingProgressUI(){const total=loadingStepCache.length,done=loadingStepCache.filter(s=>loadingProgressDone.has(s.id)).length,pct=total?(done/total)*100:0;if(loadingProgressText)loadingProgressText.textContent=`${done} / ${total} steps loaded`;if(loadingProgressBar)loadingProgressBar.style.width=`${pct}%`;}
function selectLoadingStep(stepId){const step=loadingStepCache.find(s=>s.id===stepId);selectedLoadingStepId=step?.id||'';selectedLoadingPlacementIndices=new Set(step?.indices||[]);renderPackingAndLoadingLists(packingResult);render3D(packingResult);}

/* =========================================================
   REFRESH UI
========================================================= */

function scheduleRefreshEverything() {
  if (refreshFrameId) return;
  refreshFrameId = requestAnimationFrame(() => {
    refreshFrameId = 0;
    refreshEverything();
  });
}

function refreshEverything() {
  ensureProductPlacementRules();
  assignUniqueDisplayColours();

  /*
    One shared physical packing result is calculated first.
    Product rules decide WHERE each cargo is allowed to go.
  */
  packingResult =
    calculatePacking();

  const totals =
    calculateTotals(
      packingResult
    );

  renderCargoList();

  renderFitResults(
    packingResult
  );

  renderLegend();

  renderOccupancyList(
    packingResult
  );

  renderContainerDimensions(
    totals
  );

  renderUtilisation(
    totals
  );

  renderPackingAndLoadingLists(
    packingResult
  );

  render3D(
    packingResult
  );

  renderCapacityGuard(
    packingResult,
    totals
  );

  completeActionLoaderSoon();
}


function orientationIcon(type) {
  const common =
    `viewBox="0 0 24 24" aria-hidden="true" focusable="false"`;

  if (type === 'default') {
    return `
      <svg ${common}>
        <rect x="7" y="7" width="10" height="10" rx="1.5"></rect>
        <path d="M5.3 8.7A8 8 0 0 1 19 6"></path>
        <path d="M18.8 3.8 19 6.2l-2.4.2"></path>
      </svg>
    `;
  }

  if (type === 'rotate') {
    return `
      <svg ${common}>
        <rect x="7" y="7" width="10" height="10" rx="1.5"></rect>
        <path d="M4.8 12a7.2 7.2 0 1 1 2.1 5.1"></path>
        <path d="M4.5 8.5 4.8 12l3.5-.3"></path>
      </svg>
    `;
  }

  if (type === 'sideways') {
    return `
      <svg ${common}>
        <rect x="7" y="7" width="10" height="10" rx="1.5"></rect>
        <path d="M12 4.8a7.2 7.2 0 1 1-5.1 2.1"></path>
        <path d="M8.5 4.5 12 4.8l-.3 3.5"></path>
      </svg>
    `;
  }

  if (type === 'auto') {
    return `
      <svg ${common}>
        <rect x="7.2" y="7.2" width="9.6" height="9.6" rx="1.5"></rect>
        <path d="M5 12a7 7 0 0 1 12.6-4.2"></path>
        <path d="M19 12a7 7 0 0 1-12.6 4.2"></path>
        <path d="m17.4 4.6.2 3.2-3.2.2"></path>
        <path d="m6.6 19.4-.2-3.2 3.2-.2"></path>
      </svg>
    `;
  }

  if (type === 'upside') {
    return `
      <svg ${common}>
        <rect x="7" y="7" width="10" height="10" rx="1.5"></rect>
        <path d="M6 6 4 4"></path>
        <path d="M18 18 20 20"></path>
        <path d="M4 8V4h4"></path>
        <path d="M20 16v4h-4"></path>
      </svg>
    `;
  }

  return '';
}


function orientationButtonLabel(type) {
  return {
    default: 'Reset',
    rotate: 'Floor',
    sideways: 'Side',
    auto: 'Auto',
    upside: 'Flip'
  }[type] || '';
}


/* =========================================================
   INTUITIVE QUANTITY CONTROLS
========================================================= */

function clampCargoQuantity(value) {
  const number = Math.round(Number(value || 0));
  return Math.max(0, Math.min(50000, Number.isFinite(number) ? number : 0));
}

function queueCargoQuantitySave(itemId, quantity) {
  const item = items.find(cargo => cargo.Item_ID === itemId);
  if (!item) return;

  const nextVersion = (quantitySaveVersions.get(itemId) || 0) + 1;
  quantitySaveVersions.set(itemId, nextVersion);

  clearTimeout(quantitySaveTimers.get(itemId));
  setAutosaveState('saving');

  const timer = setTimeout(async () => {
    try {
      const result = await apiPost({
        action: 'updateItem',
        sessionToken,
        Item_ID: itemId,
        Quantity: clampCargoQuantity(quantity)
      });

      if (!result.ok) throw new Error(result.message || 'Unable to save quantity.');
      if (quantitySaveVersions.get(itemId) === nextVersion) setAutosaveState('saved');
    } catch (error) {
      if (quantitySaveVersions.get(itemId) === nextVersion) {
        setAutosaveState('error');
        showToast(error.message || 'Unable to save quantity.', 'error');
        try { await reloadPlan(); } catch (reloadError) { console.warn(reloadError); }
      }
    }
  }, 420);

  quantitySaveTimers.set(itemId, timer);
}

function setCargoQuantity(itemId, quantity, options = {}) {
  const item = items.find(cargo => cargo.Item_ID === itemId);
  if (!item) return;

  const next = clampCargoQuantity(quantity);
  const previous = clampCargoQuantity(item.Quantity);
  if (next === previous) return;

  item.Quantity = next;

  // Coalesce rapid +/− clicks into a single visual recalculation per animation frame.
  scheduleRefreshEverything();
  if (options.save !== false) queueCargoQuantitySave(itemId, next);
  if (options.toast) showToast(options.toast);
}

function packingKeepsExistingCargo(candidateResult, baselineResult, itemId) {
  const baselineRows = new Map(
    (baselineResult?.results || []).map(row => [row.item.Item_ID, Number(row.fitted || 0)])
  );

  return (candidateResult?.results || []).every(row => {
    if (row.item.Item_ID === itemId) return true;
    return Number(row.fitted || 0) >= Number(baselineRows.get(row.item.Item_ID) || 0);
  });
}

function findMaximumSafeQuantity(itemId) {
  const item = items.find(cargo => cargo.Item_ID === itemId);
  const container = selectedContainer();
  if (!item || !container) return clampCargoQuantity(item?.Quantity || 0);

  const originalQuantity = clampCargoQuantity(item.Quantity);
  const baselineResult = packingResult || calculatePacking();
  const baselineRow = baselineResult?.results?.find(row => row.item.Item_ID === itemId);
  const baselineFitted = Number(baselineRow?.fitted || 0);

  const packageWeight = Math.max(0, Number(item.Gross_Weight_Kg || 0));
  const maxPayload = Math.max(0, Number(container.Max_Payload_Kg || 0));
  const boxVolume = Math.max(1, Number(item.Length_mm || 0) * Number(item.Width_mm || 0) * Number(item.Height_mm || 0));
  const containerVolume = Math.max(1, Number(container.Internal_Length_mm || 0) * Number(container.Internal_Width_mm || 0) * Number(container.Internal_Height_mm || 0));

  const volumeCeiling = Math.ceil(containerVolume / boxVolume * 1.15);
  const payloadCeiling = packageWeight > 0 && maxPayload > 0 ? Math.ceil(maxPayload / packageWeight) : 50000;
  const absoluteCeiling = Math.max(originalQuantity, Math.min(50000, volumeCeiling, payloadCeiling));

  const fitsCandidate = quantity => {
    item.Quantity = quantity;
    const candidate = calculatePacking();
    const row = candidate?.results?.find(resultRow => resultRow.item.Item_ID === itemId);
    return Number(row?.fitted || 0) >= quantity && packingKeepsExistingCargo(candidate, baselineResult, itemId);
  };

  if (!fitsCandidate(originalQuantity)) {
    item.Quantity = originalQuantity;
    return originalQuantity;
  }

  let low = Math.max(originalQuantity, baselineFitted);
  let high = absoluteCeiling;

  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (fitsCandidate(mid)) low = mid;
    else high = mid - 1;
  }

  item.Quantity = originalQuantity;
  return low;
}

async function fillAvailableCargo(itemId, button) {
  const item = items.find(cargo => cargo.Item_ID === itemId);
  if (!item) return;

  const before = clampCargoQuantity(item.Quantity);

  await withButtonLoader(button, 'Finding space…', async () => {
    showViewerLoader('Finding the maximum safe quantity…');
    await new Promise(resolve => requestAnimationFrame(() => resolve()));

    const maximum = findMaximumSafeQuantity(itemId);
    hideViewerLoader();

    if (maximum <= before) {
      showToast('No additional cartons can safely fit with the current cargo and rules.');
      return;
    }

    setCargoQuantity(itemId, maximum);
    showToast(`Added ${formatNumber(maximum - before)} carton${maximum - before === 1 ? '' : 's'} · ${formatNumber(maximum)} total.`);
  });
}

/* =========================================================
   CARGO LIST
========================================================= */

function renderCargoList() {
  const previousScrollTop = cargoList.scrollTop;

  if (!items.length) {
    cargoList.innerHTML =
      `
      <div class="empty-state">
        Add your first product.
      </div>
      `;

    return;
  }

  cargoList.innerHTML = '';

  items.forEach(item => {
    const totalItemWeight =
      Number(
        item.Gross_Weight_Kg ||
        0
      ) *
      Number(
        item.Quantity ||
        0
      );

    const mode =
      getOrientationMode(
        item
      );

    const upsideActive =
      toBoolean(
        item.Turn_Upside_Down
      );

    const fitRow =
      packingResult?.results
        ?.find(
          row =>
            row.item.Item_ID ===
            item.Item_ID
        );

    const fitted =
      Number(
        fitRow?.fitted ||
        0
      );

    const requested =
      Number(
        fitRow?.requested ||
        item.Quantity ||
        0
      );

    const remaining =
      Math.max(
        0,
        requested -
        fitted
      );

    const breakdown =
      fitRow?.breakdown ||
      [];

    const card =
      document.createElement(
        'article'
      );

    card.className =
      'cargo-card';
    card.dataset.itemId = item.Item_ID;

    card.innerHTML =
      `
      <div class="cargo-title-row">
        <span
          class="colour-dot"
          style="
            background:
            ${escapeHtml(
              displayColour(
                item
              )
            )}
          "
        ></span>

        <div class="cargo-name">
          ${escapeHtml(
            item.Product_Name
          )}
        </div>

        ${
          fitRow?.mixed
            ? `<span class="mixed-badge">MIXED</span>`
            : ''
        }

        <div class="cargo-spacer"></div>

        <label class="colour-picker-wrap" title="Choose product colour">
          <input
            class="product-colour-input"
            type="color"
            value="${escapeHtml(displayColour(item))}"
            aria-label="Choose colour for ${escapeHtml(item.Product_Name)}"
          >
        </label>

        <button
          class="small-btn focus-product ${highlightedItemId === item.Item_ID ? 'active' : ''}"
          type="button"
          title="Highlight this product in 3D"
        >
          ${highlightedItemId === item.Item_ID ? 'Show All' : 'Focus'}
        </button>

        <button
          class="small-btn cargo-collapse-toggle"
          type="button"
          aria-label="Open cargo controls"
        >
          Controls
        </button>

        <button
          class="small-btn edit"
          type="button"
        >
          Edit
        </button>

        <button
          class="small-btn danger remove"
          type="button"
        >
          ×
        </button>
      </div>

      <div class="cargo-meta">
        Qty: ${formatNumber(
          item.Quantity
        )}
        &nbsp; | &nbsp;
        Type: ${escapeHtml(
          item.Packing_Type
        )}
        &nbsp; | &nbsp;
        Wt: ${formatDecimal(
          weightFromKG(
            totalItemWeight
          ),
          2
        )} ${weightLabel()}
        <br>

        Box:
        ${formatDimension(
          item.Length_mm
        )}
        ×
        ${formatDimension(
          item.Width_mm
        )}
        ×
        ${formatDimension(
          item.Height_mm
        )}
        ${dimensionLabel()}
        <br>

        Gross Wt/Unit:
        ${formatDecimal(
          weightFromKG(
            item.Gross_Weight_Kg
          ),
          2
        )} ${weightLabel()}
      </div>

      <div class="quantity-control-card">
        <div class="quantity-control-head">
          <div>
            <span class="quantity-kicker">CARTONS / PACKAGES</span>
            <strong>Adjust quantity</strong>
          </div>
          <span class="quantity-loaded-note">${formatNumber(fitted)} loaded</span>
        </div>

        <div class="quantity-stepper-row">
          <button class="quantity-step-btn quantity-minus" type="button" aria-label="Remove one carton" title="Remove one carton">−</button>
          <input class="quantity-direct-input" type="number" min="0" max="50000" step="1" inputmode="numeric" value="${clampCargoQuantity(item.Quantity)}" aria-label="Requested quantity for ${escapeHtml(item.Product_Name)}">
          <button class="quantity-step-btn quantity-plus" type="button" aria-label="Add one carton" title="Add one carton">+</button>
          <button class="fill-available-btn" type="button" title="Add the maximum extra cartons that can safely fit without reducing other loaded cargo">Fill Available</button>
        </div>

        <div class="quantity-quick-row">
          <button class="quantity-quick-btn quantity-minus-ten" type="button">−10</button>
          <button class="quantity-quick-btn quantity-plus-ten" type="button">+10</button>
          <span>${formatNumber(remaining)} remaining · ${formatDecimal(weightFromKG(Number(item.Gross_Weight_Kg || 0) * Number(item.Quantity || 0)), 2)} ${weightLabel()} requested</span>
        </div>
      </div>

      <div class="mobile-primary-actions" aria-label="Cargo controls">
        <button class="mobile-cargo-action" data-mobile-tool="rotate" type="button">↻<span>Rotate</span></button>
        <button class="mobile-cargo-action" data-mobile-tool="move" type="button">↔<span>Move</span></button>
        <button class="mobile-cargo-action" data-mobile-tool="stack" type="button">⇧<span>Stack</span></button>
        <button class="mobile-cargo-action" data-mobile-tool="advanced" type="button">•••<span>More</span></button>
      </div>

      <div class="live-fit-strip ${remaining > 0 ? 'has-remaining' : ''}">
        <div>
          <span>LIVE FIT</span>
          <strong>
            ${formatNumber(
              fitted
            )} / ${formatNumber(
              requested
            )}
          </strong>
        </div>

        <div>
          <span>
            ${
              fitRow?.mixed
                ? 'MIXED ORIENTATIONS'
                : 'ORIENTATION USED'
            }
          </span>

          <strong class="orientation-breakdown-text">
            ${escapeHtml(
              formatOrientationBreakdown(
                breakdown
              )
            )}
          </strong>
        </div>

        <div>
          <span>REMAINING</span>
          <strong>
            ${formatNumber(
              remaining
            )}
          </strong>
        </div>
      </div>

      ${
        remaining > 0
          ? `<div class="capacity-stop-reason">${fitRow?.stopReason === 'payload' ? 'Stopped by container payload limit' : 'Stopped because no valid shared 3D space remains'}</div>`
          : ''
      }

      <div class="orientation-label">
        Rotate box — 3D preview updates instantly
      </div>

      <div class="orientation-row orientation-icon-row">
        <button
          class="orientation-btn icon-orientation-btn default-btn ${mode === 'default' ? 'active' : ''}"
          type="button"
          aria-label="Reset to default orientation"
          title="Use only the original box orientation"
        >
          ${orientationIcon('default')}
          <span>Reset</span>
        </button>

        <button
          class="orientation-btn icon-orientation-btn rotate-btn ${mode === 'rotate' ? 'active' : ''}"
          type="button"
          aria-label="Rotate box on container floor"
          title="Use floor-rotated cartons only"
        >
          ${orientationIcon('rotate')}
          <span>Floor</span>
        </button>

        <button
          class="orientation-btn icon-orientation-btn sideways-btn ${mode === 'sideways' ? 'active' : ''}"
          type="button"
          aria-label="Turn box sideways"
          title="Use sideways carton orientations"
        >
          ${orientationIcon('sideways')}
          <span>Side</span>
        </button>

        <button
          class="orientation-btn icon-orientation-btn auto-btn ${mode === 'auto' ? 'active' : ''}"
          type="button"
          aria-label="Automatically mix box orientations for maximum fit"
          title="Auto Best Fit — mix all six orientations to maximise fitted boxes"
        >
          ${orientationIcon('auto')}
          <span>Auto Mix</span>
        </button>

        <button
          class="orientation-btn icon-orientation-btn upside-btn ${upsideActive ? 'active' : ''}"
          type="button"
          aria-label="Allow box to be upside down"
          title="Allow upside-down handling"
        >
          ${orientationIcon('upside')}
          <span>Flip</span>
        </button>
      </div>

      <div class="stack-row">
        <span>
          ${toBoolean(
            item.Stackable
          ) ? '☑' : '☐'}
          Stackable
        </span>

        <span>
          Max Layers:
          ${Number(
            item.Max_Layers ||
            0
          ) || 'Auto'}
        </span>
      </div>

      <div class="weight-placement-row">
        <span>⚖</span>

        <span>
          ${formatDecimal(
            weightFromKG(
              item.Gross_Weight_Kg
            ),
            2
          )} ${weightLabel()} / package
        </span>

        <strong>
          ${getWeightPriorityLabel(
            item
          )}
        </strong>
      </div>

      <div class="manual-layout-box">
        <div class="manual-layout-head">
          <div>
            <div class="product-placement-title">Layout Mode</div>
            <div class="manual-layout-help">
              Auto packs everything. Guided lets you choose an area. Manual gives precise control when you need it.
            </div>
          </div>
          ${
            getProductRule(item).layoutMode !== 'auto'
              ? `<span class="manual-active-badge">1 FT GRID</span>`
              : ''
          }
        </div>

        <div class="layout-mode-tabs">
          <button
            class="layout-mode-btn ${getProductRule(item).layoutMode === 'auto' ? 'active' : ''}"
            data-layout-mode="auto"
            type="button"
          >
            Auto
          </button>

          <button
            class="layout-mode-btn ${getProductRule(item).layoutMode === 'guided' ? 'active' : ''}"
            data-layout-mode="guided"
            type="button"
          >
            Guided
          </button>

          <button
            class="layout-mode-btn ${getProductRule(item).layoutMode === 'manual' ? 'active' : ''}"
            data-layout-mode="manual"
            type="button"
          >
            Manual
          </button>
        </div>

        <div class="manual-zone-quick ${getProductRule(item).layoutMode === 'auto' ? 'hidden' : ''}">
          <button class="small-btn zone-pick-btn ${manualSelectedItemId === item.Item_ID ? 'active' : ''}" type="button">
            ${manualSelectedItemId === item.Item_ID ? 'Tap the 1 ft Grid…' : 'Select Area on 1 ft Grid'}
          </button>
          <button class="small-btn zone-full-width-btn" type="button">Use Full Width</button>
          <span class="manual-gizmo-hint">Use Move / Stack below for simple positioning. Precise coordinates stay under More.</span>
        </div>

        <details class="manual-advanced-details ${getProductRule(item).layoutMode === 'auto' ? 'hidden' : ''}">
          <summary>Advanced position, size & orientation</summary>
        <div class="manual-zone-editor">
          <div class="zone-section-label">START CUBE · FEET FROM BACK / LEFT / FLOOR</div>

          <div class="zone-input-grid">
            <label>
              <span>X · Length</span>
              <input class="zone-number" data-zone-field="zoneXFt" type="number" min="0" step="1" value="${Number(getProductRule(item).zoneXFt || 0)}">
            </label>

            <label>
              <span>Y · Width</span>
              <input class="zone-number" data-zone-field="zoneYFt" type="number" min="0" step="1" value="${Number(getProductRule(item).zoneYFt || 0)}">
            </label>

            <label>
              <span>Z · Height</span>
              <input class="zone-number" data-zone-field="zoneZFt" type="number" min="0" step="1" value="${Number(getProductRule(item).zoneZFt || 0)}">
            </label>
          </div>

          <div class="zone-section-label">DRAG / SIZE THE PRODUCT ZONE</div>

          <div class="zone-input-grid">
            <label>
              <span>X Size · Length</span>
              <input class="zone-number" data-zone-field="zoneLFt" type="number" min="1" step="1" value="${Math.max(1, Number(getProductRule(item).zoneLFt || 1))}">
            </label>

            <label>
              <span>Y Size · Width</span>
              <input class="zone-number" data-zone-field="zoneWFt" type="number" min="1" step="1" value="${Math.max(1, Number(getProductRule(item).zoneWFt || 1))}">
            </label>

            <label>
              <span>Z Size · Height</span>
              <input class="zone-number" data-zone-field="zoneHFt" type="number" min="1" step="1" value="${Math.max(1, Number(getProductRule(item).zoneHFt || 1))}">
            </label>
          </div>

          <div class="manual-move-stack-panel">
            <div class="zone-section-label">MOVE &amp; STACK</div>
            <div class="manual-move-grid" aria-label="Move selected cargo zone">
              <span></span><button class="move-zone-btn stack-up" data-move-axis="z" data-move-delta="1" type="button" title="Move / stack up">▲<small>UP</small></button><span></span>
              <button class="move-zone-btn" data-move-axis="x" data-move-delta="-1" type="button" title="Move toward back">◀<small>BACK</small></button>
              <div class="move-zone-centre">SELECTED<br>ZONE</div>
              <button class="move-zone-btn" data-move-axis="x" data-move-delta="1" type="button" title="Move toward doors">▶<small>DOORS</small></button>
              <button class="move-zone-btn" data-move-axis="y" data-move-delta="-1" type="button" title="Move left">◀<small>LEFT</small></button>
              <button class="move-zone-btn stack-down" data-move-axis="z" data-move-delta="-1" type="button" title="Move / stack down">▼<small>DOWN</small></button>
              <button class="move-zone-btn" data-move-axis="y" data-move-delta="1" type="button" title="Move right">▶<small>RIGHT</small></button>
            </div>
            <div class="stack-action-row">
              <button class="small-btn zone-layer-btn" data-layer-delta="1" type="button">+ Stack Layer</button>
              <button class="small-btn zone-layer-btn" data-layer-delta="-1" type="button">− Stack Layer</button>
              <button class="small-btn zone-fill-height-btn" type="button">Fill Up</button>
            </div>
            <div class="manual-move-note">Arrows move the selected zone 1 ft. Stack Layer changes the reserved stacking height by 1 ft. Packing safety rules still apply.</div>
          </div>

          <div class="manual-zone-actions">
            <label class="manual-orientation-field">
              <span>Orientation inside zone</span>
              <select class="manual-orientation-select">
                <option value="auto" ${getProductRule(item).manualOrientation === 'auto' ? 'selected' : ''}>Auto Best Fit</option>
                <option value="default" ${getProductRule(item).manualOrientation === 'default' ? 'selected' : ''}>Default</option>
                <option value="floor" ${getProductRule(item).manualOrientation === 'floor' ? 'selected' : ''}>Rotate Left / Right</option>
                <option value="side" ${getProductRule(item).manualOrientation === 'side' ? 'selected' : ''}>Sideways</option>
              </select>
            </label>

            <button class="small-btn zone-pick-btn ${manualSelectedItemId === item.Item_ID ? 'active' : ''}" type="button">
              ${manualSelectedItemId === item.Item_ID ? 'Tap Container Grid…' : 'Select Start Cube'}
            </button>

            <button class="small-btn zone-full-width-btn" type="button">
              Full Width
            </button>
          </div>

          <div class="zone-summary">
            Zone:
            ${Number(getProductRule(item).zoneLFt || 0)}′ L ×
            ${Number(getProductRule(item).zoneWFt || 0)}′ W ×
            ${Number(getProductRule(item).zoneHFt || 0)}′ H
            · Start
            X${Number(getProductRule(item).zoneXFt || 0)}′
            Y${Number(getProductRule(item).zoneYFt || 0)}′
            Z${Number(getProductRule(item).zoneZFt || 0)}′
          </div>
        </div>
        </details>
      </div>

      <details class="advanced-placement-details">
        <summary>Advanced placement strategy</summary>
      <div class="product-placement-box">
        <div class="product-placement-title">
          Placement Strategy
        </div>

        <div class="product-placement-tabs">
          <button
            class="placement-mode-btn ${getProductRule(item).placement === 'auto' ? 'active' : ''}"
            data-placement="auto"
            type="button"
          >
            Auto
          </button>

          <button
            class="placement-mode-btn ${getProductRule(item).placement === 'floor-base' ? 'active' : ''}"
            data-placement="floor-base"
            type="button"
          >
            Floor Base
          </button>

          <button
            class="placement-mode-btn ${getProductRule(item).placement === 'bottom-top' ? 'active' : ''}"
            data-placement="bottom-top"
            type="button"
          >
            Bottom→Top
          </button>

          <button
            class="placement-mode-btn ${getProductRule(item).placement === 'top-layer' ? 'active' : ''}"
            data-placement="top-layer"
            type="button"
          >
            Top Layer
          </button>
        </div>

        <div class="placement-select-grid">
          <label>
            <span>Position</span>
            <select class="placement-position-select">
              <option value="any" ${getProductRule(item).longitudinal === 'any' ? 'selected' : ''}>Any</option>
              <option value="back" ${getProductRule(item).longitudinal === 'back' ? 'selected' : ''}>Back</option>
              <option value="middle" ${getProductRule(item).longitudinal === 'middle' ? 'selected' : ''}>Middle</option>
              <option value="front" ${getProductRule(item).longitudinal === 'front' ? 'selected' : ''}>Front / Doors</option>
            </select>
          </label>

          <label>
            <span>Across Width</span>
            <select class="placement-lateral-select">
              <option value="any" ${getProductRule(item).lateral === 'any' ? 'selected' : ''}>Any</option>
              <option value="left" ${getProductRule(item).lateral === 'left' ? 'selected' : ''}>Left</option>
              <option value="center" ${getProductRule(item).lateral === 'center' ? 'selected' : ''}>Centre</option>
              <option value="right" ${getProductRule(item).lateral === 'right' ? 'selected' : ''}>Right</option>
            </select>
          </label>

          <label class="floor-coverage-field ${getProductRule(item).placement === 'floor-base' ? '' : 'hidden'}">
            <span>Floor Coverage</span>
            <select class="floor-coverage-select">
              <option value="auto" ${getProductRule(item).floorCoverage === 'auto' ? 'selected' : ''}>Auto</option>
              <option value="25" ${getProductRule(item).floorCoverage === '25' ? 'selected' : ''}>25%</option>
              <option value="50" ${getProductRule(item).floorCoverage === '50' ? 'selected' : ''}>50%</option>
              <option value="75" ${getProductRule(item).floorCoverage === '75' ? 'selected' : ''}>75%</option>
              <option value="100" ${getProductRule(item).floorCoverage === '100' ? 'selected' : ''}>Full Floor</option>
            </select>
          </label>

          <label class="support-field ${getProductRule(item).placement === 'top-layer' ? '' : 'hidden'}">
            <span>Minimum Support</span>
            <select class="support-select">
              <option value="80" ${Number(getProductRule(item).supportPct) === 80 ? 'selected' : ''}>80%</option>
              <option value="85" ${Number(getProductRule(item).supportPct) === 85 ? 'selected' : ''}>85%</option>
              <option value="90" ${Number(getProductRule(item).supportPct) === 90 ? 'selected' : ''}>90%</option>
              <option value="100" ${Number(getProductRule(item).supportPct) === 100 ? 'selected' : ''}>100%</option>
            </select>
          </label>
        </div>

        <div class="placement-current-rule">
          ${escapeHtml(
            placementLabel(
              getProductRule(
                item
              ).placement
            )
          )}
          · ${escapeHtml(
            getProductRule(
              item
            ).longitudinal === 'any'
              ? 'Any position'
              : getProductRule(
                  item
                ).longitudinal
          )}
        </div>
      </div>
      </details>
      `;

    if (!expandedCargoItemId && items.length) expandedCargoItemId = items[0].Item_ID;
    const mobileTool = mobileCargoToolState.get(item.Item_ID) || '';
    card.dataset.mobileTool = mobileTool;
    card.classList.toggle('expanded', expandedCargoItemId === item.Item_ID);

    const titleRow = card.querySelector('.cargo-title-row');
    const body = document.createElement('div');
    body.className = 'cargo-card-body';
    Array.from(card.children).forEach(child => {
      if (child !== titleRow) body.appendChild(child);
    });
    card.appendChild(body);

    [
      ['.manual-advanced-details', 'manual'],
      ['.advanced-placement-details', 'placement']
    ].forEach(([selector, key]) => {
      const details = card.querySelector(selector);
      if (!details) return;
      const stateKey = `${item.Item_ID}|${key}`;
      details.open = openCargoDetailKeys.has(stateKey) ||
        (key === 'manual' && (mobileTool === 'move' || mobileTool === 'stack')) ||
        (key === 'placement' && mobileTool === 'advanced');
      details.addEventListener('toggle', () => {
        if (details.open) openCargoDetailKeys.add(stateKey);
        else openCargoDetailKeys.delete(stateKey);
      });
    });

    card.querySelector('.cargo-collapse-toggle')?.addEventListener('click', () => {
      expandedCargoItemId = expandedCargoItemId === item.Item_ID ? '' : item.Item_ID;
      renderCargoList();
    });

    card.querySelectorAll('.mobile-cargo-action').forEach(button => {
      button.addEventListener('click', () => {
        const tool = button.dataset.mobileTool || '';
        expandedCargoItemId = item.Item_ID;
        const next = mobileCargoToolState.get(item.Item_ID) === tool ? '' : tool;
        mobileCargoToolState.set(item.Item_ID, next);

        if (next === 'move' || next === 'stack') {
          const rule = getProductRule(item);
          if (rule.layoutMode === 'auto') {
            productPlacementRules[item.Item_ID] = {
              ...defaultProductRule(item),
              ...(productPlacementRules[item.Item_ID] || {}),
              layoutMode: 'guided'
            };
            saveProductPlacementRules();
          }
          manualSelectedItemId = item.Item_ID;
          manualGridVisible = true;
          highlightedItemId = item.Item_ID;
          openCargoDetailKeys.add(`${item.Item_ID}|manual`);
          refreshEverything();
          return;
        }

        if (next === 'advanced') openCargoDetailKeys.add(`${item.Item_ID}|placement`);
        renderCargoList();
      });
    });

    card
      .querySelector(
        '.product-colour-input'
      )
      .addEventListener(
        'change',
        event =>
          setProductColour(
            item.Item_ID,
            event.target.value
          )
      );

    card
      .querySelector(
        '.focus-product'
      )
      .addEventListener(
        'click',
        () =>
          toggleProductFocus(
            item.Item_ID
          )
      );

    card
      .querySelector('.edit')
      .addEventListener(
        'click',
        () =>
          editCargo(
            item.Item_ID
          )
      );

    card
      .querySelector('.remove')
      .addEventListener(
        'click',
        () =>
          deleteCargo(
            item.Item_ID
          )
      );

    card.querySelector('.quantity-minus')?.addEventListener('click', () =>
      setCargoQuantity(item.Item_ID, Number(item.Quantity || 0) - 1)
    );

    card.querySelector('.quantity-plus')?.addEventListener('click', () =>
      setCargoQuantity(item.Item_ID, Number(item.Quantity || 0) + 1)
    );

    card.querySelector('.quantity-minus-ten')?.addEventListener('click', () =>
      setCargoQuantity(item.Item_ID, Number(item.Quantity || 0) - 10)
    );

    card.querySelector('.quantity-plus-ten')?.addEventListener('click', () =>
      setCargoQuantity(item.Item_ID, Number(item.Quantity || 0) + 10)
    );

    card.querySelector('.quantity-direct-input')?.addEventListener('change', event =>
      setCargoQuantity(item.Item_ID, event.target.value)
    );

    card.querySelector('.fill-available-btn')?.addEventListener('click', event =>
      fillAvailableCargo(item.Item_ID, event.currentTarget)
    );

    card
      .querySelector('.default-btn')
      .addEventListener(
        'click',
        () =>
          setOrientation(
            item.Item_ID,
            'default'
          )
      );

    card
      .querySelector('.rotate-btn')
      .addEventListener(
        'click',
        () =>
          setOrientation(
            item.Item_ID,
            'rotate'
          )
      );

    card
      .querySelector('.sideways-btn')
      .addEventListener(
        'click',
        () =>
          setOrientation(
            item.Item_ID,
            'sideways'
          )
      );

    card
      .querySelector('.auto-btn')
      .addEventListener(
        'click',
        () =>
          setOrientation(
            item.Item_ID,
            'auto'
          )
      );

    card
      .querySelector('.upside-btn')
      .addEventListener(
        'click',
        () =>
          setOrientation(
            item.Item_ID,
            'upside'
          )
      );

    card
      .querySelectorAll(
        '.layout-mode-btn'
      )
      .forEach(
        button => {
          button.addEventListener(
            'click',
            () => {
              const nextMode =
                button.dataset.layoutMode;

              updateProductRule(
                item.Item_ID,
                'layoutMode',
                nextMode
              );

              if (nextMode === 'guided' || nextMode === 'manual') {
                expandedCargoItemId = item.Item_ID;
                mobileCargoToolState.set(item.Item_ID, 'move');
                openCargoDetailKeys.add(`${item.Item_ID}|manual`);
                manualSelectedItemId = item.Item_ID;
                manualGridVisible = true;
                highlightedItemId = item.Item_ID;
                renderCargoList();
                render3D(packingResult);
              } else if (
                nextMode === 'auto' &&
                manualSelectedItemId === item.Item_ID
              ) {
                manualSelectedItemId = '';
                manualGridVisible = false;
              }
            }
          );
        }
      );

    card
      .querySelectorAll('.move-zone-btn')
      .forEach(button => {
        button.addEventListener('click', () => {
          manualSelectedItemId = item.Item_ID;
          highlightedItemId = item.Item_ID;
          moveManualZone(item.Item_ID, button.dataset.moveAxis, Number(button.dataset.moveDelta || 0));
        });
      });

    card.querySelectorAll('.zone-layer-btn').forEach(button => {
      button.addEventListener('click', () => {
        const rule = getProductRule(item);
        const delta = Number(button.dataset.layerDelta || 0);
        const container = selectedContainer();
        const maxHeightFt = Math.max(1, Math.floor(Number(container?.Internal_Height_mm || 0) / ONE_FOOT_MM));
        const current = Math.max(1, Number(rule.zoneHFt || 1));
        const next = Math.min(maxHeightFt, Math.max(1, current + delta));
        manualSelectedItemId = item.Item_ID;
        highlightedItemId = item.Item_ID;
        updateProductRule(item.Item_ID, 'zoneHFt', next);
      });
    });

    card.querySelector('.zone-fill-height-btn')?.addEventListener('click', () => {
      const rule = getProductRule(item);
      const container = selectedContainer();
      const startFt = Math.max(0, Number(rule.zoneZFt || 0));
      const totalFt = Number(container?.Internal_Height_mm || 0) / ONE_FOOT_MM;
      const availableFt = Math.max(1, Math.floor(totalFt - startFt));
      manualSelectedItemId = item.Item_ID;
      highlightedItemId = item.Item_ID;
      updateProductRule(item.Item_ID, 'zoneHFt', availableFt);
    });

    card
      .querySelectorAll(
        '.zone-number'
      )
      .forEach(
        input => {
          input.addEventListener(
            'change',
            event => {
              const field =
                event.target.dataset.zoneField;

              const min =
                field ===
                'zoneXFt' ||
                field ===
                'zoneYFt' ||
                field ===
                'zoneZFt'
                  ? 0
                  : 1;

              updateProductRule(
                item.Item_ID,
                field,
                Math.max(
                  min,
                  Math.round(
                    Number(
                      event.target.value ||
                      min
                    )
                  )
                )
              );
            }
          );
        }
      );

    card
      .querySelector(
        '.manual-orientation-select'
      )
      ?.addEventListener(
        'change',
        event =>
          updateProductRule(
            item.Item_ID,
            'manualOrientation',
            event.target.value
          )
      );

    card
      .querySelector(
        '.zone-pick-btn'
      )
      ?.addEventListener(
        'click',
        () => {
          manualSelectedItemId =
            item.Item_ID;

          manualGridVisible =
            true;

          highlightedItemId =
            item.Item_ID;

          renderCargoList();

          render3D(
            packingResult
          );

          showToast(
            'Tap a 1 ft floor cube in the container to set X and Y. Use Z to move the zone upward.'
          );
        }
      );

    card
      .querySelector(
        '.zone-full-width-btn'
      )
      ?.addEventListener(
        'click',
        () => {
          const container =
            selectedContainer();

          if (!container) {
            return;
          }

          const widthFt =
            Math.max(
              1,
              Math.ceil(
                Number(
                  container.Internal_Width_mm ||
                  0
                ) /
                ONE_FOOT_MM
              )
            );

          productPlacementRules[
            item.Item_ID
          ] = {
            ...getProductRule(
              item
            ),
            zoneYFt:
              0,
            zoneWFt:
              widthFt
          };

          saveProductPlacementRules();
          refreshEverything();

          showToast(
            'Zone set to full container width.'
          );
        }
      );

    card
      .querySelectorAll(
        '.placement-mode-btn'
      )
      .forEach(
        button => {
          button.addEventListener(
            'click',
            () =>
              updateProductRule(
                item.Item_ID,
                'placement',
                button.dataset.placement
              )
          );
        }
      );

    card
      .querySelector(
        '.placement-position-select'
      )
      .addEventListener(
        'change',
        event =>
          updateProductRule(
            item.Item_ID,
            'longitudinal',
            event.target.value
          )
      );

    card
      .querySelector(
        '.placement-lateral-select'
      )
      .addEventListener(
        'change',
        event =>
          updateProductRule(
            item.Item_ID,
            'lateral',
            event.target.value
          )
      );

    card
      .querySelector(
        '.floor-coverage-select'
      )
      .addEventListener(
        'change',
        event =>
          updateProductRule(
            item.Item_ID,
            'floorCoverage',
            event.target.value
          )
      );

    card
      .querySelector(
        '.support-select'
      )
      .addEventListener(
        'change',
        event =>
          updateProductRule(
            item.Item_ID,
            'supportPct',
            Number(
              event.target.value
            )
          )
      );

    cargoList.appendChild(
      card
    );
  });

  requestAnimationFrame(() => {
    cargoList.scrollTop = previousScrollTop;
  });
}


/* =========================================================
   TOTALS
========================================================= */

function calculateTotals(
  result
) {
  const placements =
    result?.placements ||
    [];

  const loadedByItem =
    new Map();

  placements.forEach(
    placement => {
      loadedByItem.set(
        placement.itemId,
        (
          loadedByItem.get(
            placement.itemId
          ) ||
          0
        ) +
        1
      );
    }
  );

  let packages = 0;
  let weightKG = 0;
  let cbm = 0;

  items.forEach(
    item => {
      const loadedQty =
        loadedByItem.get(
          item.Item_ID
        ) ||
        0;

      packages +=
        loadedQty;

      weightKG +=
        Number(
          item.Gross_Weight_Kg ||
          0
        ) *
        loadedQty;

      cbm +=
        (
          Number(
            item.Length_mm
          ) *
          Number(
            item.Width_mm
          ) *
          Number(
            item.Height_mm
          ) *
          loadedQty
        ) /
        1000000000;
    }
  );

  const container =
    selectedContainer();

  let containerCBM = 0;
  let volumePct = 0;
  let payloadPct = 0;

  const maxPayloadKG =
    Number(
      container?.Max_Payload_Kg ||
      0
    );

  if (container) {
    containerCBM =
      (
        Number(
          container.Internal_Length_mm
        ) *
        Number(
          container.Internal_Width_mm
        ) *
        Number(
          container.Internal_Height_mm
        )
      ) /
      1000000000;

    volumePct =
      containerCBM
        ? cbm /
          containerCBM *
          100
        : 0;

    payloadPct =
      maxPayloadKG
        ? weightKG /
          maxPayloadKG *
          100
        : 0;
  }

  document
    .getElementById('totalPackages')
    .textContent =
      formatNumber(
        packages
      );

  document
    .getElementById('totalWeight')
    .textContent =
      `${formatDecimal(
        weightFromKG(
          weightKG
        ),
        2
      )} ${weightLabel()}`;

  document
    .getElementById('totalCBM')
    .textContent =
      `${formatDecimal(
        cbm,
        3
      )} CBM`;

  document
    .getElementById('volumeUsed')
    .textContent =
      `${formatDecimal(
        Math.min(
          100,
          volumePct
        ),
        1
      )}%`;

  document
    .getElementById('payloadUsed')
    .textContent =
      `${formatDecimal(
        Math.min(
          100,
          payloadPct
        ),
        1
      )}%`;

  saveTotals(
    packages,
    weightKG,
    cbm,
    Math.min(
      100,
      volumePct
    ),
    Math.min(
      100,
      payloadPct
    )
  );

  return {
    packages,
    weightKG,
    cbm,
    containerCBM,
    volumePct:
      Math.min(
        100,
        volumePct
      ),
    payloadPct:
      Math.min(
        100,
        payloadPct
      ),
    maxPayloadKG
  };
}


async function saveTotals(
  packages,
  weightKG,
  cbm,
  volumePct,
  payloadPct
) {
  if (!plan) {
    return;
  }

  try {
    await apiPost({
      action: 'updatePlan',
      sessionToken,
      Plan_ID:
        plan.Plan_ID,
      Total_Packages:
        packages,
      Total_Gross_Weight_Kg:
        Number(
          weightKG.toFixed(2)
        ),
      Cargo_Volume_CBM:
        Number(
          cbm.toFixed(3)
        ),
      Container_Volume_Used_Pct:
        Number(
          volumePct.toFixed(2)
        ),
      Payload_Used_Pct:
        Number(
          payloadPct.toFixed(2)
        )
    });
  } catch (error) {
    console.warn(
      'Unable to autosave totals',
      error
    );
  }
}


/* =========================================================
   PACKING HEURISTIC
========================================================= */

function productRulesStorageKey() {
  return (
    plan?.Plan_ID
      ? `forego_product_placement_${plan.Plan_ID}`
      : ''
  );
}


function defaultProductRule(
  item
) {
  return {
    placement:
      'auto',

    floorCoverage:
      'auto',

    longitudinal:
      'any',

    lateral:
      'any',

    supportPct:
      85,

    /*
      Hybrid layout mode:
      auto   = optimiser controls this product
      guided = user chooses a 1 ft zone, optimiser chooses best orientation
      manual = user chooses a 1 ft zone and preferred orientation
    */
    layoutMode:
      'auto',

    zoneXFt:
      0,

    zoneYFt:
      0,

    zoneZFt:
      0,

    zoneLFt:
      4,

    zoneWFt:
      7,

    zoneHFt:
      4,

    manualOrientation:
      'auto'
  };
}


function loadProductPlacementRules() {
  productPlacementRules = {};

  const key =
    productRulesStorageKey();

  if (!key) {
    return;
  }

  try {
    const stored =
      JSON.parse(
        localStorage.getItem(
          key
        ) ||
        '{}'
      );

    if (
      stored &&
      typeof stored ===
      'object'
    ) {
      productPlacementRules =
        stored;
    }
  } catch (error) {
    console.warn(
      'Unable to load product placement rules',
      error
    );
  }
}


function saveProductPlacementRules() {
  const key =
    productRulesStorageKey();

  if (!key) {
    return;
  }

  localStorage.setItem(
    key,
    JSON.stringify(
      productPlacementRules
    )
  );
}


function ensureProductPlacementRules() {
  const currentIds =
    new Set(
      items.map(
        item =>
          item.Item_ID
      )
    );

  Object.keys(
    productPlacementRules
  ).forEach(
    itemId => {
      if (
        !currentIds.has(
          itemId
        )
      ) {
        delete productPlacementRules[
          itemId
        ];
      }
    }
  );

  items.forEach(
    item => {
      productPlacementRules[
        item.Item_ID
      ] = {
        ...defaultProductRule(
          item
        ),
        ...(
          productPlacementRules[
            item.Item_ID
          ] ||
          {}
        )
      };
    }
  );

  saveProductPlacementRules();
}


function getProductRule(
  item
) {
  return (
    productPlacementRules[
      item.Item_ID
    ] ||
    defaultProductRule(
      item
    )
  );
}


function updateProductRule(
  itemId,
  field,
  value
) {
  const item =
    items.find(
      cargo =>
        cargo.Item_ID ===
        itemId
    );

  if (!item) {
    return;
  }

  productPlacementRules[
    itemId
  ] = {
    ...defaultProductRule(
      item
    ),
    ...(
      productPlacementRules[
        itemId
      ] ||
      {}
    ),
    [field]:
      value
  };

  saveProductPlacementRules();

  refreshEverything();

  showToast(
    'Placement rule updated.'
  );
}


function placementLabel(
  value
) {
  return {
    auto:
      'Auto',

    'floor-base':
      'Floor Base',

    'bottom-top':
      'Bottom → Top',

    'top-layer':
      'Top Layer'
  }[
    value
  ] ||
  'Auto';
}


function getPlacementSortedItems() {
  const rank = {
    'floor-base':
      0,

    'bottom-top':
      1,

    auto:
      2,

    'top-layer':
      3
  };

  return [
    ...items
  ].sort(
    (
      a,
      b
    ) => {
      const ar =
        getProductRule(
          a
        );

      const br =
        getProductRule(
          b
        );

      const rankDiff =
        (
          rank[
            ar.placement
          ] ??
          2
        ) -
        (
          rank[
            br.placement
          ] ??
          2
        );

      if (
        rankDiff !==
        0
      ) {
        return rankDiff;
      }

      /*
        Within the same placement group, heavier cartons go first.
      */
      const weightDiff =
        Number(
          b.Gross_Weight_Kg ||
          0
        ) -
        Number(
          a.Gross_Weight_Kg ||
          0
        );

      if (
        Math.abs(
          weightDiff
        ) >
        0.0001
      ) {
        return weightDiff;
      }

      return (
        Number(
          a.Loading_Order ||
          0
        ) -
        Number(
          b.Loading_Order ||
          0
        )
      );
    }
  );
}


function computePayloadTargets(
  orderedItems,
  maxPayloadKG
) {
  const targets =
    new Map();

  const totalRequestedWeight =
    orderedItems.reduce(
      (
        sum,
        item
      ) =>
        sum +
        Number(
          item.Quantity ||
          0
        ) *
        Math.max(
          0,
          Number(
            item.Gross_Weight_Kg ||
            0
          )
        ),
      0
    );

  if (
    maxPayloadKG <=
    0 ||
    totalRequestedWeight <=
    maxPayloadKG +
    0.0001
  ) {
    orderedItems.forEach(
      item =>
        targets.set(
          item.Item_ID,
          Number(
            item.Quantity ||
            0
          )
        )
    );

    return targets;
  }

  /*
    Fair payload reservation:
    scale all requested product quantities by the same payload ratio.
    This prevents the first/heaviest product from consuming 100% of
    payload before the other requested products get any allocation.
  */
  const ratio =
    maxPayloadKG /
    totalRequestedWeight;

  let usedWeight =
    0;

  orderedItems.forEach(
    item => {
      const requested =
        Number(
          item.Quantity ||
          0
        );

      const weight =
        Math.max(
          0,
          Number(
            item.Gross_Weight_Kg ||
            0
          )
        );

      const target =
        weight > 0
          ? Math.min(
              requested,
              Math.floor(
                requested *
                ratio
              )
            )
          : requested;

      targets.set(
        item.Item_ID,
        target
      );

      usedWeight +=
        target *
        weight;
    }
  );

  /*
    Spend remaining payload one carton at a time, following the
    user's placement order while preserving the fair initial share.
  */
  let progress =
    true;

  while (
    progress
  ) {
    progress =
      false;

    for (
      const item of
      orderedItems
    ) {
      const current =
        targets.get(
          item.Item_ID
        ) ||
        0;

      const requested =
        Number(
          item.Quantity ||
          0
        );

      const weight =
        Math.max(
          0,
          Number(
            item.Gross_Weight_Kg ||
            0
          )
        );

      if (
        current >=
        requested
      ) {
        continue;
      }

      if (
        weight <=
        0 ||
        usedWeight +
        weight <=
        maxPayloadKG +
        0.0001
      ) {
        targets.set(
          item.Item_ID,
          current +
          1
        );

        usedWeight +=
          weight;

        progress =
          true;
      }
    }
  }

  return targets;
}


function floorCoverageRatio(
  rule
) {
  if (
    rule.floorCoverage ===
    '25'
  ) {
    return 0.25;
  }

  if (
    rule.floorCoverage ===
    '50'
  ) {
    return 0.5;
  }

  if (
    rule.floorCoverage ===
    '75'
  ) {
    return 0.75;
  }

  if (
    rule.floorCoverage ===
    '100'
  ) {
    return 1;
  }

  return null;
}


function placementSupportRatio(
  x,
  y,
  z,
  l,
  w,
  placements
) {
  if (
    z <=
    0.001
  ) {
    return 1;
  }

  let supportedArea =
    0;

  placements.forEach(
    placed => {
      const top =
        placed.z +
        placed.h;

      if (
        Math.abs(
          top -
          z
        ) >
        1
      ) {
        return;
      }

      const overlapL =
        Math.max(
          0,
          Math.min(
            x + l,
            placed.x +
            placed.l
          ) -
          Math.max(
            x,
            placed.x
          )
        );

      const overlapW =
        Math.max(
          0,
          Math.min(
            y + w,
            placed.y +
            placed.w
          ) -
          Math.max(
            y,
            placed.y
          )
        );

      supportedArea +=
        overlapL *
        overlapW;
    }
  );

  return Math.min(
    1,
    supportedArea /
    Math.max(
      1,
      l *
      w
    )
  );
}


function productLongitudinalScore(
  space,
  orientation,
  container,
  rule
) {
  if (
    rule.longitudinal ===
    'front'
  ) {
    return roundScore(
      container.L -
      (
        space.x +
        orientation.l
      )
    );
  }

  if (
    rule.longitudinal ===
    'middle'
  ) {
    return roundScore(
      Math.abs(
        (
          space.x +
          orientation.l /
          2
        ) -
        container.L /
        2
      )
    );
  }

  if (
    rule.longitudinal ===
    'back'
  ) {
    return roundScore(
      space.x
    );
  }

  return 0;
}


function productLateralScore(
  space,
  orientation,
  container,
  rule
) {
  if (
    rule.lateral ===
    'right'
  ) {
    return roundScore(
      container.W -
      (
        space.y +
        orientation.w
      )
    );
  }

  if (
    rule.lateral ===
    'center'
  ) {
    return roundScore(
      Math.abs(
        (
          space.y +
          orientation.w /
          2
        ) -
        container.W /
        2
      )
    );
  }

  if (
    rule.lateral ===
    'left'
  ) {
    return roundScore(
      space.y
    );
  }

  return 0;
}


function clampNumber(
  value,
  min,
  max
) {
  return Math.min(
    max,
    Math.max(
      min,
      Number(
        value ||
        0
      )
    )
  );
}


function moveManualZoneByFoot(itemId, axis, delta) {
  const item = items.find(cargo => cargo.Item_ID === itemId);
  const container = selectedContainer();
  if (!item || !container) return;

  const rule = getProductRule(item);
  const dimensionMM = {
    x: Number(container.Internal_Length_mm || 0),
    y: Number(container.Internal_Width_mm || 0),
    z: Number(container.Internal_Height_mm || 0)
  }[axis];
  const sizeFt = {
    x: Math.max(1, Number(rule.zoneLFt || 1)),
    y: Math.max(1, Number(rule.zoneWFt || 1)),
    z: Math.max(1, Number(rule.zoneHFt || 1))
  }[axis];
  const field = { x: 'zoneXFt', y: 'zoneYFt', z: 'zoneZFt' }[axis];
  if (!field || !dimensionMM) return;

  const maxStartFt = Math.max(0, Math.floor((dimensionMM - sizeFt * ONE_FOOT_MM) / ONE_FOOT_MM + 1e-6));
  const current = Math.max(0, Math.round(Number(rule[field] || 0)));
  const next = Math.min(maxStartFt, Math.max(0, current + delta));
  if (next === current) return;

  productPlacementRules[itemId] = {
    ...defaultProductRule(item),
    ...rule,
    [field]: next
  };

  saveProductPlacementRules();
  scheduleRefreshEverything();
}

function activeManualItemId() {
  if (manualSelectedItemId && items.some(item => item.Item_ID === manualSelectedItemId)) {
    return manualSelectedItemId;
  }

  const active = items.find(item => {
    const mode = String(getProductRule(item)?.layoutMode || 'auto').toLowerCase();
    return mode === 'guided' || mode === 'manual';
  });

  return active?.Item_ID || '';
}

function addManualMoveArrow(origin, direction, length, colour, itemId, axis, delta) {
  const dir = direction.clone().normalize();
  const group = new THREE.Group();
  const headLength = length * 0.30;
  const shaftLength = length - headLength;
  const shaftRadius = Math.max(0.028, length * 0.060);
  const headRadius = Math.max(0.075, length * 0.15);
  const material = new THREE.MeshBasicMaterial({
    color: colour,
    transparent: true,
    opacity: 0.92,
    depthTest: false
  });

  const alignYToDir = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir
  );

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 10),
    material
  );
  shaft.quaternion.copy(alignYToDir);
  shaft.position.copy(origin).addScaledVector(dir, shaftLength / 2);
  shaft.renderOrder = 50;
  group.add(shaft);

  const head = new THREE.Mesh(
    new THREE.ConeGeometry(headRadius, headLength, 12),
    material
  );
  head.quaternion.copy(alignYToDir);
  head.position.copy(origin).addScaledVector(dir, shaftLength + headLength / 2);
  head.renderOrder = 50;
  group.add(head);

  // Larger nearly-invisible hit target keeps the arrows easy to tap on a tablet.
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(shaftRadius * 3.2, shaftRadius * 3.2, length, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.001, depthWrite: false, depthTest: false })
  );
  hit.quaternion.copy(alignYToDir);
  hit.position.copy(origin).addScaledVector(dir, length / 2);
  hit.userData.manualMove = { itemId, axis, delta };
  hit.renderOrder = 60;
  group.add(hit);
  manualGizmoTargets.push(hit);

  cargoGroup.add(group);
}

function manualZoneForItem(
  item,
  container
) {
  const rule =
    getProductRule(
      item
    );

  const x =
    clampNumber(
      Number(
        rule.zoneXFt ||
        0
      ) *
      ONE_FOOT_MM,
      0,
      container.L
    );

  const y =
    clampNumber(
      Number(
        rule.zoneYFt ||
        0
      ) *
      ONE_FOOT_MM,
      0,
      container.W
    );

  const z =
    clampNumber(
      Number(
        rule.zoneZFt ||
        0
      ) *
      ONE_FOOT_MM,
      0,
      container.H
    );

  const l =
    clampNumber(
      Math.max(
        1,
        Number(
          rule.zoneLFt ||
          1
        )
      ) *
      ONE_FOOT_MM,
      1,
      Math.max(
        1,
        container.L -
        x
      )
    );

  const w =
    clampNumber(
      Math.max(
        1,
        Number(
          rule.zoneWFt ||
          1
        )
      ) *
      ONE_FOOT_MM,
      1,
      Math.max(
        1,
        container.W -
        y
      )
    );

  const h =
    clampNumber(
      Math.max(
        1,
        Number(
          rule.zoneHFt ||
          1
        )
      ) *
      ONE_FOOT_MM,
      1,
      Math.max(
        1,
        container.H -
        z
      )
    );

  return {
    x,
    y,
    z,
    l,
    w,
    h
  };
}


function boxesIntersect(
  a,
  b
) {
  const EPS =
    0.001;

  return !(
    a.x +
      a.l <=
      b.x +
      EPS ||
    b.x +
      b.l <=
      a.x +
      EPS ||
    a.y +
      a.w <=
      b.y +
      EPS ||
    b.y +
      b.w <=
      a.y +
      EPS ||
    a.z +
      a.h <=
      b.z +
      EPS ||
    b.z +
      b.h <=
      a.z +
      EPS
  );
}


function placementOverlaps(
  candidate,
  placements
) {
  return placements.some(
    placed =>
      boxesIntersect(
        candidate,
        placed
      )
  );
}


function subtractPlacementFromSpaces(
  freeSpaces,
  placement
) {
  const next =
    [];

  freeSpaces.forEach(
    space => {
      if (
        !boxesIntersect(
          space,
          placement
        )
      ) {
        next.push(
          space
        );

        return;
      }

      const sx2 =
        space.x +
        space.l;

      const sy2 =
        space.y +
        space.w;

      const sz2 =
        space.z +
        space.h;

      const px1 =
        Math.max(
          space.x,
          placement.x
        );

      const py1 =
        Math.max(
          space.y,
          placement.y
        );

      const pz1 =
        Math.max(
          space.z,
          placement.z
        );

      const px2 =
        Math.min(
          sx2,
          placement.x +
          placement.l
        );

      const py2 =
        Math.min(
          sy2,
          placement.y +
          placement.w
        );

      const pz2 =
        Math.min(
          sz2,
          placement.z +
          placement.h
        );

      const push =
        (
          x,
          y,
          z,
          l,
          w,
          h
        ) => {
          if (
            l >
            0.001 &&
            w >
            0.001 &&
            h >
            0.001
          ) {
            next.push({
              x,
              y,
              z,
              l,
              w,
              h
            });
          }
        };

      /*
        Six non-overlapping slabs around an arbitrary occupied box.
        This allows Auto Fill to continue around manually reserved
        product placements.
      */
      push(
        space.x,
        space.y,
        space.z,
        px1 -
          space.x,
        space.w,
        space.h
      );

      push(
        px2,
        space.y,
        space.z,
        sx2 -
          px2,
        space.w,
        space.h
      );

      push(
        px1,
        space.y,
        space.z,
        px2 -
          px1,
        py1 -
          space.y,
        space.h
      );

      push(
        px1,
        py2,
        space.z,
        px2 -
          px1,
        sy2 -
          py2,
        space.h
      );

      push(
        px1,
        py1,
        space.z,
        px2 -
          px1,
        py2 -
          py1,
        pz1 -
          space.z
      );

      push(
        px1,
        py1,
        pz2,
        px2 -
          px1,
        py2 -
          py1,
        sz2 -
          pz2
      );
    }
  );

  return pruneContainedSpaces(
    next
  );
}


function manualOrientationChoices(
  item,
  rule
) {
  const all =
    allowedOrientations(
      item
    );

  if (
    !all.length
  ) {
    return [];
  }

  if (
    rule.layoutMode ===
      'guided' ||
    rule.manualOrientation ===
      'auto'
  ) {
    return all;
  }

  const wanted =
    rule.manualOrientation;

  const filtered =
    all.filter(
      orientation =>
        orientation.type ===
        wanted
    );

  return filtered.length
    ? filtered
    : all;
}


function chooseManualZoneOrientation(
  item,
  rule,
  zone
) {
  const choices =
    manualOrientationChoices(
      item,
      rule
    );

  let best =
    null;

  choices.forEach(
    orientation => {
      let layers =
        Math.floor(
          zone.h /
          orientation.h
        );

      if (
        !toBoolean(
          item.Stackable
        )
      ) {
        layers =
          Math.min(
            layers,
            1
          );
      }

      const maxLayers =
        Number(
          item.Max_Layers ||
          0
        );

      if (
        maxLayers >
        0
      ) {
        layers =
          Math.min(
            layers,
            maxLayers
          );
      }

      const capacity =
        Math.floor(
          zone.l /
          orientation.l
        ) *
        Math.floor(
          zone.w /
          orientation.w
        ) *
        Math.max(
          0,
          layers
        );

      const usedVolume =
        capacity *
        orientation.l *
        orientation.w *
        orientation.h;

      if (
        !best ||
        capacity >
          best.capacity ||
        (
          capacity ===
            best.capacity &&
          usedVolume >
            best.usedVolume
        )
      ) {
        best = {
          orientation,
          capacity,
          usedVolume
        };
      }
    }
  );

  return best;
}


function buildManualZonePlacements(
  item,
  targetQuantity,
  container,
  placements,
  loadedPayloadKG,
  maxPayloadKG
) {
  const rule =
    getProductRule(
      item
    );

  const zone =
    manualZoneForItem(
      item,
      container
    );

  const selected =
    chooseManualZoneOrientation(
      item,
      rule,
      zone
    );

  const packageWeightKG =
    Math.max(
      0,
      Number(
        item.Gross_Weight_Kg ||
        0
      )
    );

  const created =
    [];

  if (
    !selected ||
    selected.capacity <=
    0
  ) {
    return {
      placements:
        created,
      loadedPayloadKG,
      zone,
      orientation:
        null,
      stopReason:
        'manual-zone'
    };
  }

  const o =
    selected.orientation;

  const zoneEndX =
    zone.x +
    zone.l;

  const zoneEndY =
    zone.y +
    zone.w;

  const zoneEndZ =
    zone.z +
    zone.h;

  const maxLayers =
    Number(
      item.Max_Layers ||
      0
    );

  let layer =
    0;

  outer:
  for (
    let z = zone.z;
    z +
      o.h <=
      zoneEndZ +
      0.001;
    z +=
      o.h
  ) {
    layer++;

    if (
      !toBoolean(
        item.Stackable
      ) &&
      layer >
      1
    ) {
      break;
    }

    if (
      maxLayers >
      0 &&
      layer >
      maxLayers
    ) {
      break;
    }

    for (
      let y = zone.y;
      y +
        o.w <=
        zoneEndY +
        0.001;
      y +=
        o.w
    ) {
      for (
        let x = zone.x;
        x +
          o.l <=
          zoneEndX +
          0.001;
        x +=
          o.l
      ) {
        if (
          created.length >=
          targetQuantity
        ) {
          break outer;
        }

        if (
          maxPayloadKG >
          0 &&
          loadedPayloadKG +
          packageWeightKG >
          maxPayloadKG +
          0.0001
        ) {
          break outer;
        }

        const candidate = {
          itemId:
            item.Item_ID,

          colour:
            displayColour(
              item
            ),

          x,
          y,
          z,

          l:
            o.l,

          w:
            o.w,

          h:
            o.h,

          orientationKey:
            o.key,

          orientationType:
            o.type,

          placementMode:
            rule.layoutMode ===
            'manual'
              ? 'manual-zone'
              : 'guided-zone'
        };

        if (
          placementOverlaps(
            candidate,
            [
              ...placements,
              ...created
            ]
          )
        ) {
          continue;
        }

        /*
          Anything above the floor must be physically supported.
          This is what allows a manually selected upper zone to sit
          on top of a product already placed below it.
        */
        if (
          z >
          0.001
        ) {
          const support =
            placementSupportRatio(
              x,
              y,
              z,
              o.l,
              o.w,
              [
                ...placements,
                ...created
              ]
            );

          if (
            support <
            0.80
          ) {
            continue;
          }

          if (
            !supportCargoIsSafe(
              x,
              y,
              z,
              o.l,
              o.w,
              item,
              [
                ...placements,
                ...created
              ]
            )
          ) {
            continue;
          }
        }

        created.push(
          candidate
        );

        loadedPayloadKG +=
          packageWeightKG;
      }
    }
  }

  return {
    placements:
      created,

    loadedPayloadKG,

    zone,

    orientation:
      o,

    stopReason:
      created.length <
      targetQuantity
        ? 'manual-zone'
        : ''
  };
}


function calculatePacking() {
  const container =
    selectedContainer();

  if (
    !container ||
    !items.length
  ) {
    return {
      placements: [],
      results: [],
      freeSpaces: []
    };
  }

  const C = {
    L:
      Number(
        container.Internal_Length_mm
      ),

    W:
      Number(
        container.Internal_Width_mm
      ),

    H:
      Number(
        container.Internal_Height_mm
      )
  };

  let freeSpaces = [
    {
      x: 0,
      y: 0,
      z: 0,
      l: C.L,
      w: C.W,
      h: C.H
    }
  ];

  const placements = [];
  const results = [];

  const maxPayloadKG =
    Number(
      container.Max_Payload_Kg ||
      0
    );

  let loadedPayloadKG =
    0;

  const sortedItems =
    getPlacementSortedItems();

  const payloadTargets =
    computePayloadTargets(
      sortedItems,
      maxPayloadKG
    );

  /*
    HYBRID PRE-PASS
    Guided / Manual products are physically placed first in the
    user's selected 1 ft zones. Their actual carton dimensions are
    still used. Every placed carton is then subtracted from the free
    3D space so Auto products can pack around and above them.
  */
  for (
    const item of
    sortedItems.filter(
      cargo =>
        getProductRule(
          cargo
        ).layoutMode !==
        'auto'
    )
  ) {
    const requested =
      Number(
        item.Quantity ||
        0
      );

    const targetQuantity =
      Math.min(
        requested,
        payloadTargets.get(
          item.Item_ID
        ) ??
        requested
      );

    const rule =
      getProductRule(
        item
      );

    const packageWeightKG =
      Math.max(
        0,
        Number(
          item.Gross_Weight_Kg ||
          0
        )
      );

    const manual =
      buildManualZonePlacements(
        item,
        targetQuantity,
        C,
        placements,
        loadedPayloadKG,
        maxPayloadKG
      );

    loadedPayloadKG =
      manual.loadedPayloadKG;

    manual.placements.forEach(
      placement => {
        placements.push(
          placement
        );

        freeSpaces =
          subtractPlacementFromSpaces(
            freeSpaces,
            placement
          );
      }
    );

    const fitted =
      manual.placements.length;

    const remaining =
      Math.max(
        0,
        requested -
        fitted
      );

    const breakdown =
      manual.orientation &&
      fitted
        ? [
            {
              key:
                manual.orientation.key,

              type:
                manual.orientation.type,

              label:
                orientationHumanLabel(
                  manual.orientation,
                  item
                ),

              dimensions: {
                l:
                  manual.orientation.l,

                w:
                  manual.orientation.w,

                h:
                  manual.orientation.h
              },

              count:
                fitted
            }
          ]
        : [];

    const floorAreaCovered =
      manual.placements
        .filter(
          placement =>
            placement.z <=
            0.001
        )
        .reduce(
          (
            sum,
            placement
          ) =>
            sum +
            placement.l *
            placement.w,
          0
        );

    results.push({
      item,
      requested,
      targetQuantity,
      fitted,
      remaining,
      breakdown,
      mixed:
        false,

      stopReason:
        manual.stopReason,

      rule,

      manualZone:
        manual.zone,

      floorAreaCovered,

      floorCoveragePct:
        C.L *
        C.W
          ? floorAreaCovered /
            (
              C.L *
              C.W
            ) *
            100
          : 0,

      loadedWeightKG:
        fitted *
        packageWeightKG,

      packageWeightKG,

      orientation:
        breakdown.length
          ? {
              ...breakdown[
                0
              ].dimensions,

              type:
                breakdown[
                  0
                ].type,

              label:
                breakdown[
                  0
                ].label
            }
          : null
    });
  }

  for (
    const item of
    sortedItems
  ) {
    /*
      Guided / Manual products were already handled by the hybrid
      pre-pass. The standard optimiser handles Auto products only.
    */
    if (
      getProductRule(
        item
      ).layoutMode !==
      'auto'
    ) {
      continue;
    }
    const requested =
      Number(
        item.Quantity ||
        0
      );

    const targetQuantity =
      Math.min(
        requested,
        payloadTargets.get(
          item.Item_ID
        ) ??
        requested
      );

    const orientations =
      allowedOrientations(
        item
      );

    const rule =
      getProductRule(
        item
      );

    const packageWeightKG =
      Math.max(
        0,
        Number(
          item.Gross_Weight_Kg ||
          0
        )
      );

    let fitted =
      0;

    let stopReason =
      '';

    let floorAreaCovered =
      0;

    const containerFloorArea =
      C.L *
      C.W;

    const coverageRatio =
      floorCoverageRatio(
        rule
      );

    const targetFloorArea =
      coverageRatio ===
      null
        ? null
        : containerFloorArea *
          coverageRatio;

    const breakdownMap =
      new Map();

    const maxIterations =
      Math.min(
        targetQuantity,
        10000
      );

    for (
      let boxIndex = 0;
      boxIndex < maxIterations;
      boxIndex++
    ) {
      if (
        maxPayloadKG >
        0 &&
        loadedPayloadKG +
        packageWeightKG >
        maxPayloadKG +
        0.0001
      ) {
        stopReason =
          'payload';

        break;
      }

      let phase =
        rule.placement;

      /*
        Floor Base:
        keep placing on z=0 until the chosen floor coverage is met.
        After that, remaining cartons may stack/use supported spaces.
      */
      if (
        rule.placement ===
        'floor-base'
      ) {
        if (
          targetFloorArea ===
          null
        ) {
          phase =
            floorAreaCovered <
            containerFloorArea
              ? 'floor-base'
              : 'auto';
        } else {
          phase =
            floorAreaCovered <
            targetFloorArea
              ? 'floor-base'
              : 'auto';
        }
      }

      const candidate =
        findBestMixedPlacement(
          freeSpaces,
          orientations,
          item,
          C,
          {
            rule,
            phase,
            placements
          }
        );

      if (!candidate) {
        /*
          For Floor Base, once the requested floor condition can no
          longer be extended, allow remaining cartons to continue in
          normal supported spaces.
        */
        if (
          rule.placement ===
          'floor-base' &&
          phase ===
          'floor-base'
        ) {
          const fallback =
            findBestMixedPlacement(
              freeSpaces,
              orientations,
              item,
              C,
              {
                rule,
                phase:
                  'auto',
                placements
              }
            );

          if (fallback) {
            candidate.spaceIndex =
              fallback.spaceIndex;
            candidate.space =
              fallback.space;
            candidate.orientation =
              fallback.orientation;
            candidate.score =
              fallback.score;
          } else {
            stopReason =
              'space';

            break;
          }
        } else {
          stopReason =
            'space';

          break;
        }
      }

      const placement = {
        itemId:
          item.Item_ID,

        colour:
          displayColour(
            item
          ),

        x:
          candidate.space.x,

        y:
          candidate.space.y,

        z:
          candidate.space.z,

        l:
          candidate.orientation.l,

        w:
          candidate.orientation.w,

        h:
          candidate.orientation.h,

        orientationKey:
          candidate.orientation.key,

        orientationType:
          candidate.orientation.type,

        placementMode:
          rule.placement
      };

      placements.push(
        placement
      );

      fitted++;

      loadedPayloadKG +=
        packageWeightKG;

      if (
        placement.z <=
        0.001
      ) {
        floorAreaCovered +=
          placement.l *
          placement.w;
      }

      const key =
        candidate.orientation.key;

      if (
        !breakdownMap.has(
          key
        )
      ) {
        breakdownMap.set(
          key,
          {
            key,
            type:
              candidate.orientation.type,

            label:
              orientationHumanLabel(
                candidate.orientation,
                item
              ),

            dimensions: {
              l:
                candidate.orientation.l,

              w:
                candidate.orientation.w,

              h:
                candidate.orientation.h
            },

            count:
              0
          }
        );
      }

      breakdownMap
        .get(key)
        .count++;

      freeSpaces =
        splitFreeSpaceAfterPlacement(
          freeSpaces,
          candidate.spaceIndex,
          candidate.orientation
        );

      freeSpaces =
        pruneContainedSpaces(
          freeSpaces
        );
    }

    const remaining =
      Math.max(
        0,
        requested -
        fitted
      );

    if (
      remaining >
      0 &&
      fitted >=
      targetQuantity &&
      targetQuantity <
      requested
    ) {
      stopReason =
        'payload-reserved';
    }

    const breakdown =
      [...breakdownMap.values()]
        .sort(
          (
            a,
            b
          ) =>
            b.count -
            a.count
        );

    results.push({
      item,
      requested,
      targetQuantity,
      fitted,
      remaining,
      breakdown,
      mixed:
        breakdown.length >
        1,

      stopReason,

      rule,

      floorAreaCovered,

      floorCoveragePct:
        containerFloorArea
          ? floorAreaCovered /
            containerFloorArea *
            100
          : 0,

      loadedWeightKG:
        fitted *
        packageWeightKG,

      packageWeightKG,

      orientation:
        breakdown.length
          ? {
              ...breakdown[
                0
              ].dimensions,

              type:
                breakdown[
                  0
                ].type,

              label:
                breakdown[
                  0
                ].label
            }
          : null
    });
  }

  /*
    TIGHT PACK — GLOBAL GAP FILL PASS
    ---------------------------------
    The first pass respects the user's product placement priorities.
    This second pass then treats every remaining free 3D space as
    shared space and tries ALL still-unloaded products in ALL allowed
    orientations.

    This is what allows:
      - Product B above Product A
      - smaller cartons inside leftover side gaps
      - mixed products within the same length section
      - a final "use every practical gap" pass
  */
  const gapFillLimit =
    Math.min(
      12000,
      results.reduce(
        (
          sum,
          row
        ) =>
          sum +
          Math.max(
            0,
            Number(
              row.targetQuantity ||
              0
            ) -
            Number(
              row.fitted ||
              0
            )
          ),
        0
      )
    );

  for (
    let gapIteration = 0;
    gapIteration <
    gapFillLimit;
    gapIteration++
  ) {
    let bestGlobal =
      null;

    for (
      const row of
      results
    ) {
      const item =
        row.item;

      /*
        A user-reserved Guided / Manual product stays inside its
        selected zone. Auto Fill uses only products left in Auto.
      */
      if (
        getProductRule(
          item
        ).layoutMode !==
        'auto'
      ) {
        continue;
      }

      const remainingTarget =
        Math.max(
          0,
          Number(
            row.targetQuantity ||
            0
          ) -
          Number(
            row.fitted ||
            0
          )
        );

      if (
        remainingTarget <=
        0
      ) {
        continue;
      }

      const packageWeightKG =
        Math.max(
          0,
          Number(
            item.Gross_Weight_Kg ||
            0
          )
        );

      if (
        maxPayloadKG >
        0 &&
        loadedPayloadKG +
        packageWeightKG >
        maxPayloadKG +
        0.0001
      ) {
        continue;
      }

      const orientations =
        allowedOrientations(
          item
        );

      const rule =
        getProductRule(
          item
        );

      /*
        During gap-fill, Floor Base / Bottom→Top / Auto products may
        use any safe supported gap. A Top Layer product remains a
        Top Layer product and must still be above the floor.
      */
      const phase =
        rule.placement ===
        'top-layer'
          ? 'top-layer'
          : 'auto';

      const candidate =
        findBestMixedPlacement(
          freeSpaces,
          orientations,
          item,
          C,
          {
            rule,
            phase,
            placements,
            tightPack:
              true
          }
        );

      if (
        !candidate
      ) {
        continue;
      }

      const boxVolume =
        candidate.orientation.l *
        candidate.orientation.w *
        candidate.orientation.h;

      const spaceVolume =
        candidate.space.l *
        candidate.space.w *
        candidate.space.h;

      const residualVolume =
        Math.max(
          0,
          spaceVolume -
          boxVolume
        );

      /*
        Global score:
        1. Prefer the smallest waste in the selected free space.
        2. Prefer lower placements.
        3. Prefer larger cartons when waste is equal.
        4. Prefer heavier cartons lower when everything else ties.
      */
      const tightScore = [
        roundScore(
          residualVolume
        ),
        roundScore(
          candidate.space.z
        ),
        -roundScore(
          boxVolume
        ),
        -roundScore(
          packageWeightKG
        ),
        ...candidate.score
      ];

      if (
        !bestGlobal ||
        compareMixedScores(
          tightScore,
          bestGlobal.tightScore
        ) <
        0
      ) {
        bestGlobal = {
          row,
          item,
          candidate,
          packageWeightKG,
          tightScore
        };
      }
    }

    if (
      !bestGlobal
    ) {
      break;
    }

    const {
      row,
      item,
      candidate,
      packageWeightKG
    } =
      bestGlobal;

    const placement = {
      itemId:
        item.Item_ID,

      colour:
        displayColour(
          item
        ),

      x:
        candidate.space.x,

      y:
        candidate.space.y,

      z:
        candidate.space.z,

      l:
        candidate.orientation.l,

      w:
        candidate.orientation.w,

      h:
        candidate.orientation.h,

      orientationKey:
        candidate.orientation.key,

      orientationType:
        candidate.orientation.type,

      placementMode:
        'gap-fill'
    };

    placements.push(
      placement
    );

    loadedPayloadKG +=
      packageWeightKG;

    row.fitted +=
      1;

    row.remaining =
      Math.max(
        0,
        Number(
          row.requested ||
          0
        ) -
        row.fitted
      );

    row.loadedWeightKG =
      row.fitted *
      packageWeightKG;

    if (
      placement.z <=
      0.001
    ) {
      row.floorAreaCovered +=
        placement.l *
        placement.w;

      row.floorCoveragePct =
        containerFloorArea
          ? row.floorAreaCovered /
            containerFloorArea *
            100
          : 0;
    }

    let breakdownRow =
      row.breakdown.find(
        part =>
          part.key ===
          candidate.orientation.key
      );

    if (
      !breakdownRow
    ) {
      breakdownRow = {
        key:
          candidate.orientation.key,

        type:
          candidate.orientation.type,

        label:
          orientationHumanLabel(
            candidate.orientation,
            item
          ),

        dimensions: {
          l:
            candidate.orientation.l,

          w:
            candidate.orientation.w,

          h:
            candidate.orientation.h
        },

        count:
          0
      };

      row.breakdown.push(
        breakdownRow
      );
    }

    breakdownRow.count +=
      1;

    row.breakdown.sort(
      (
        a,
        b
      ) =>
        b.count -
        a.count
    );

    row.mixed =
      row.breakdown.length >
      1;

    if (
      row.breakdown.length
    ) {
      row.orientation = {
        ...row.breakdown[
          0
        ].dimensions,

        type:
          row.breakdown[
            0
          ].type,

        label:
          row.breakdown[
            0
          ].label
      };
    }

    if (
      row.fitted >=
      row.requested
    ) {
      row.stopReason =
        '';
    }

    freeSpaces =
      splitFreeSpaceAfterPlacement(
        freeSpaces,
        candidate.spaceIndex,
        candidate.orientation
      );

    freeSpaces =
      pruneContainedSpaces(
        freeSpaces
      );
  }

  return {
    placements,
    results,
    freeSpaces,
    loadedPayloadKG,
    maxPayloadKG,
    tightPack:
      true
  };
}


function findBestMixedPlacement(
  freeSpaces,
  orientations,
  item,
  container,
  context = {}
) {
  let best =
    null;

  const rule =
    context.rule ||
    getProductRule(
      item
    );

  const phase =
    context.phase ||
    rule.placement ||
    'auto';

  const placements =
    context.placements ||
    [];

  for (
    let spaceIndex = 0;
    spaceIndex <
    freeSpaces.length;
    spaceIndex++
  ) {
    const space =
      freeSpaces[
        spaceIndex
      ];

    for (
      let orientationIndex = 0;
      orientationIndex <
      orientations.length;
      orientationIndex++
    ) {
      const orientation =
        orientations[
          orientationIndex
        ];

      if (
        !orientationFitsSpace(
          orientation,
          space,
          item,
          container,
          {
            rule,
            phase,
            placements
          }
        )
      ) {
        continue;
      }

      const score =
        mixedPlacementScore(
          orientation,
          space,
          item,
          container,
          {
            rule,
            phase,
            placements
          }
        );

      if (
        !best ||
        compareMixedScores(
          score,
          best.score
        ) <
        0
      ) {
        best = {
          spaceIndex,
          space,
          orientation,
          score
        };
      }
    }
  }

  return best;
}


function supportCargoIsSafe(
  x,
  y,
  z,
  l,
  w,
  item,
  placements
) {
  if (
    z <=
    0.001
  ) {
    return true;
  }

  const currentWeight =
    Math.max(
      0,
      Number(
        item.Gross_Weight_Kg ||
        0
      )
    );

  const supporters =
    placements.filter(
      placed => {
        const top =
          placed.z +
          placed.h;

        if (
          Math.abs(
            top -
            z
          ) >
          1
        ) {
          return false;
        }

        const overlapL =
          Math.max(
            0,
            Math.min(
              x + l,
              placed.x +
              placed.l
            ) -
            Math.max(
              x,
              placed.x
            )
          );

        const overlapW =
          Math.max(
            0,
            Math.min(
              y + w,
              placed.y +
              placed.w
            ) -
            Math.max(
              y,
              placed.y
            )
          );

        return (
          overlapL >
          0.001 &&
          overlapW >
          0.001
        );
      }
    );

  if (
    !supporters.length
  ) {
    return false;
  }

  for (
    const placed of
    supporters
  ) {
    const supportItem =
      items.find(
        candidate =>
          candidate.Item_ID ===
          placed.itemId
      );

    if (
      !supportItem
    ) {
      continue;
    }

    const supportWeight =
      Math.max(
        0,
        Number(
          supportItem.Gross_Weight_Kg ||
          0
        )
      );

    /*
      When both weights are known, do not place a heavier package
      directly on a lighter package.
    */
    if (
      currentWeight >
      0 &&
      supportWeight >
      0 &&
      currentWeight >
      supportWeight +
      0.0001
    ) {
      return false;
    }
  }

  return true;
}


function orientationFitsSpace(
  orientation,
  space,
  item,
  container,
  context = {}
) {
  const EPS =
    0.001;

  const rule =
    context.rule ||
    getProductRule(
      item
    );

  const phase =
    context.phase ||
    rule.placement ||
    'auto';

  const placements =
    context.placements ||
    [];

  if (
    orientation.l <=
    0 ||
    orientation.w <=
    0 ||
    orientation.h <=
    0
  ) {
    return false;
  }

  if (
    orientation.l >
      space.l +
      EPS ||
    orientation.w >
      space.w +
      EPS ||
    orientation.h >
      space.h +
      EPS
  ) {
    return false;
  }

  if (
    space.x +
    orientation.l >
    container.L +
    EPS ||
    space.y +
    orientation.w >
    container.W +
    EPS ||
    space.z +
    orientation.h >
    container.H +
    EPS
  ) {
    return false;
  }

  /*
    FLOOR BASE PHASE:
    only use floor-level free spaces.
  */
  if (
    phase ===
    'floor-base' &&
    space.z >
    EPS
  ) {
    return false;
  }

  /*
    TOP LAYER:
    carton must not touch the floor and at least the configured
    percentage of its footprint must be physically supported by
    cartons directly below it.
  */
  if (
    phase ===
    'top-layer'
  ) {
    if (
      space.z <=
      EPS
    ) {
      return false;
    }

    const support =
      placementSupportRatio(
        space.x,
        space.y,
        space.z,
        orientation.l,
        orientation.w,
        placements
      );

    if (
      support <
      Number(
        rule.supportPct ||
        85
      ) /
      100
    ) {
      return false;
    }
  }

  /*
    Any normal stacked placement above floor also requires support.
    This prevents floating cartons created by mathematical gaps.
  */
  if (
    space.z >
    EPS &&
    phase !==
    'top-layer'
  ) {
    const support =
      placementSupportRatio(
        space.x,
        space.y,
        space.z,
        orientation.l,
        orientation.w,
        placements
      );

    if (
      support <
      0.80
    ) {
      return false;
    }
  }

  /*
    Cross-product stacking safety:
    a heavier package is not allowed directly on a lighter package.
  */
  if (
    space.z >
    EPS &&
    !supportCargoIsSafe(
      space.x,
      space.y,
      space.z,
      orientation.l,
      orientation.w,
      item,
      placements
    )
  ) {
    return false;
  }

  if (
    !toBoolean(
      item.Stackable
    ) &&
    space.z >
    EPS
  ) {
    return false;
  }

  const maxLayers =
    Number(
      item.Max_Layers ||
      0
    );

  if (
    maxLayers >
    0
  ) {
    const maxStackHeight =
      orientation.h *
      maxLayers;

    if (
      space.z +
      orientation.h >
      maxStackHeight +
      EPS
    ) {
      return false;
    }
  }

  return true;
}


function mixedPlacementScore(
  orientation,
  space,
  item,
  container,
  context = {}
) {
  const rule =
    context.rule ||
    getProductRule(
      item
    );

  const phase =
    context.phase ||
    rule.placement ||
    'auto';

  const fitAlongLength =
    Math.floor(
      space.l /
      orientation.l
    );

  const fitAcrossWidth =
    Math.floor(
      space.w /
      orientation.w
    );

  let fitLayers =
    Math.floor(
      space.h /
      orientation.h
    );

  if (
    !toBoolean(
      item.Stackable
    )
  ) {
    fitLayers =
      Math.min(
        fitLayers,
        1
      );
  }

  const maxLayers =
    Number(
      item.Max_Layers ||
      0
    );

  if (
    maxLayers >
    0
  ) {
    fitLayers =
      Math.min(
        fitLayers,
        maxLayers
      );
  }

  const localCapacity =
    Math.max(
      1,
      fitAlongLength *
      fitAcrossWidth *
      fitLayers
    );

  const wastedWidth =
    space.w -
    orientation.w;

  const wastedHeight =
    space.h -
    orientation.h;

  const wastedLength =
    space.l -
    orientation.l;

  const longitudinalScore =
    productLongitudinalScore(
      space,
      orientation,
      container,
      rule
    );

  const lateralScore =
    productLateralScore(
      space,
      orientation,
      container,
      rule
    );

  /*
    Bottom → Top prioritises the chosen X/Y zone first, then stacks
    upward in that zone. Other modes prefer the lowest level first.
  */
  if (
    phase ===
    'bottom-top'
  ) {
    return [
      longitudinalScore,
      lateralScore,
      roundScore(
        space.x
      ),
      roundScore(
        space.y
      ),
      roundScore(
        space.z
      ),
      roundScore(
        wastedWidth
      ),
      roundScore(
        wastedLength
      ),
      -localCapacity
    ];
  }

  if (
    phase ===
    'top-layer'
  ) {
    return [
      longitudinalScore,
      lateralScore,
      roundScore(
        space.z
      ),
      roundScore(
        wastedWidth
      ),
      roundScore(
        wastedLength
      ),
      -localCapacity
    ];
  }

  return [
    roundScore(
      space.z
    ),
    longitudinalScore,
    lateralScore,
    roundScore(
      wastedWidth
    ),
    roundScore(
      wastedHeight
    ),
    -localCapacity,
    roundScore(
      wastedLength
    )
  ];
}


function compareMixedScores(
  a,
  b
) {
  const length =
    Math.max(
      a.length,
      b.length
    );

  for (
    let i = 0;
    i < length;
    i++
  ) {
    const av =
      a[i] ?? 0;

    const bv =
      b[i] ?? 0;

    if (
      av <
      bv
    ) {
      return -1;
    }

    if (
      av >
      bv
    ) {
      return 1;
    }
  }

  return 0;
}


function roundScore(
  value
) {
  return Math.round(
    Number(
      value ||
      0
    ) *
    1000
  ) /
  1000;
}


function splitFreeSpaceAfterPlacement(
  freeSpaces,
  usedIndex,
  orientation
) {
  const used =
    freeSpaces[
      usedIndex
    ];

  const next =
    freeSpaces.filter(
      (
        _,
        index
      ) =>
        index !==
        usedIndex
    );

  const remainingLength =
    used.l -
    orientation.l;

  const remainingWidth =
    used.w -
    orientation.w;

  const remainingHeight =
    used.h -
    orientation.h;

  /*
    Non-overlapping guillotine partition:

    1. Length slab:
       everything beyond the carton along container length.

    2. Width slab:
       remaining width beside the carton, but only inside the
       length occupied by this carton.

    3. Height slab:
       remaining height above the carton, but only over the
       carton footprint.

    Together these exactly partition the used free-space block.
  */

  if (
    remainingLength >
    0.001
  ) {
    next.push({
      x:
        used.x +
        orientation.l,

      y:
        used.y,

      z:
        used.z,

      l:
        remainingLength,

      w:
        used.w,

      h:
        used.h
    });
  }

  if (
    remainingWidth >
    0.001
  ) {
    next.push({
      x:
        used.x,

      y:
        used.y +
        orientation.w,

      z:
        used.z,

      l:
        orientation.l,

      w:
        remainingWidth,

      h:
        used.h
    });
  }

  if (
    remainingHeight >
    0.001
  ) {
    next.push({
      x:
        used.x,

      y:
        used.y,

      z:
        used.z +
        orientation.h,

      l:
        orientation.l,

      w:
        orientation.w,

      h:
        remainingHeight
    });
  }

  return next;
}


function pruneContainedSpaces(
  spaces
) {
  const filtered =
    spaces.filter(
      space =>
        space.l >
          0.001 &&
        space.w >
          0.001 &&
        space.h >
          0.001
    );

  return filtered.filter(
    (
      space,
      index
    ) => {
      for (
        let otherIndex = 0;
        otherIndex <
        filtered.length;
        otherIndex++
      ) {
        if (
          otherIndex ===
          index
        ) {
          continue;
        }

        const other =
          filtered[
            otherIndex
          ];

        if (
          spaceContainedIn(
            space,
            other
          )
        ) {
          return false;
        }
      }

      return true;
    }
  );
}


function spaceContainedIn(
  inner,
  outer
) {
  const EPS =
    0.001;

  return (
    inner.x >=
      outer.x -
      EPS &&
    inner.y >=
      outer.y -
      EPS &&
    inner.z >=
      outer.z -
      EPS &&

    inner.x +
      inner.l <=
      outer.x +
      outer.l +
      EPS &&

    inner.y +
      inner.w <=
      outer.y +
      outer.w +
      EPS &&

    inner.z +
      inner.h <=
      outer.z +
      outer.h +
      EPS
  );
}


function freeSpacePrioritySort(
  a,
  b
) {
  const container =
    selectedContainer();

  if (!container) {
    return (
      a.z -
      b.z ||
      a.x -
      b.x ||
      a.y -
      b.y
    );
  }

  const C = {
    L:
      Number(
        container.Internal_Length_mm
      ),

    W:
      Number(
        container.Internal_Width_mm
      )
  };

  const aLong =
    strategyLongitudinalPointScore(
      a,
      C
    );

  const bLong =
    strategyLongitudinalPointScore(
      b,
      C
    );

  const aLat =
    strategyLateralPointScore(
      a,
      C
    );

  const bLat =
    strategyLateralPointScore(
      b,
      C
    );

  return (
    a.z -
    b.z ||
    aLong -
    bLong ||
    aLat -
    bLat ||
    (
      b.l *
      b.w *
      b.h
    ) -
    (
      a.l *
      a.w *
      a.h
    )
  );
}


function allowedOrientations(
  item
) {
  const L =
    Number(
      item.Length_mm
    );

  const W =
    Number(
      item.Width_mm
    );

  const H =
    Number(
      item.Height_mm
    );

  const floorRotate =
    toBoolean(
      item.Rotate_Horizontal
    );

  const sideways =
    toBoolean(
      item.Turn_Sideways
    );

  let rawValues = [];

  /*
    Existing backend flags continue to encode four useful modes:

      00 = Default only
      10 = Floor Rotate only
      01 = Sideways family only
      11 = Auto Best Fit / MIXED orientation mode

    The important change is that when more than one orientation is
    available, the optimiser may use a DIFFERENT orientation for
    each individual carton.
  */

  if (
    !floorRotate &&
    !sideways
  ) {
    rawValues = [
      {
        l: L,
        w: W,
        h: H,
        type:
          'default'
      }
    ];
  }

  if (
    floorRotate &&
    !sideways
  ) {
    rawValues = [
      {
        l: W,
        w: L,
        h: H,
        type:
          'floor'
      }
    ];
  }

  if (
    !floorRotate &&
    sideways
  ) {
    rawValues = [
      {
        l: L,
        w: H,
        h: W,
        type:
          'side'
      },

      {
        l: H,
        w: L,
        h: W,
        type:
          'side'
      },

      {
        l: W,
        w: H,
        h: L,
        type:
          'side'
      },

      {
        l: H,
        w: W,
        h: L,
        type:
          'side'
      }
    ];
  }

  if (
    floorRotate &&
    sideways
  ) {
    rawValues = [
      {
        l: L,
        w: W,
        h: H,
        type:
          'default'
      },

      {
        l: W,
        w: L,
        h: H,
        type:
          'floor'
      },

      {
        l: L,
        w: H,
        h: W,
        type:
          'side'
      },

      {
        l: H,
        w: L,
        h: W,
        type:
          'side'
      },

      {
        l: W,
        w: H,
        h: L,
        type:
          'side'
      },

      {
        l: H,
        w: W,
        h: L,
        type:
          'side'
      }
    ];
  }

  const unique =
    new Map();

  rawValues.forEach(
    orientation => {
      const key =
        `${orientation.l}-${orientation.w}-${orientation.h}`;

      if (
        !unique.has(
          key
        )
      ) {
        unique.set(
          key,
          {
            ...orientation,
            key
          }
        );
      }
    }
  );

  return [
    ...unique.values()
  ];
}


function getOrientationMode(
  item
) {
  const floorRotate =
    toBoolean(
      item.Rotate_Horizontal
    );

  const sideways =
    toBoolean(
      item.Turn_Sideways
    );

  if (
    floorRotate &&
    sideways
  ) {
    return 'auto';
  }

  if (
    floorRotate
  ) {
    return 'rotate';
  }

  if (
    sideways
  ) {
    return 'sideways';
  }

  return 'default';
}


function orientationHumanLabel(
  orientation,
  item
) {
  const typeLabel = {
    default:
      'Default',

    floor:
      'Floor Rotate',

    side:
      'Sideways'
  }[
    orientation.type
  ] ||
  'Orientation';

  return (
    `${typeLabel} · ` +
    `${formatDimension(
      orientation.l
    )} × ` +
    `${formatDimension(
      orientation.w
    )} × ` +
    `${formatDimension(
      orientation.h
    )} ${dimensionLabel()}`
  );
}


function orientationLabel(
  orientation
) {
  if (
    !orientation ||
    !orientation.l ||
    !orientation.w ||
    !orientation.h
  ) {
    return '—';
  }

  if (
    orientation.label
  ) {
    return orientation.label;
  }

  return (
    `${formatDimension(
      orientation.l
    )} × ` +
    `${formatDimension(
      orientation.w
    )} × ` +
    `${formatDimension(
      orientation.h
    )} ${dimensionLabel()}`
  );
}


function formatOrientationBreakdown(
  breakdown
) {
  if (
    !Array.isArray(
      breakdown
    ) ||
    !breakdown.length
  ) {
    return '—';
  }

  return breakdown
    .map(
      entry =>
        `${entry.count} ${entry.label}`
    )
    .join(' · ');
}



/* =========================================================
   LOADING STRATEGY
========================================================= */

function strategyStorageKey() {
  return (
    plan?.Plan_ID
      ? `forego_loading_strategy_${plan.Plan_ID}`
      : ''
  );
}


function loadStrategyForPlan() {
  const key =
    strategyStorageKey();

  if (!key) {
    return;
  }

  try {
    const saved =
      JSON.parse(
        localStorage.getItem(
          key
        ) ||
        'null'
      );

    if (saved) {
      loadingStrategy = {
        ...loadingStrategy,
        ...saved
      };
    }
  } catch (error) {
    console.warn(
      'Unable to load saved strategy',
      error
    );
  }
}


function saveStrategyForPlan() {
  const key =
    strategyStorageKey();

  if (!key) {
    return;
  }

  localStorage.setItem(
    key,
    JSON.stringify(
      loadingStrategy
    )
  );
}


function ensureStrategySequence() {
  const ids =
    items.map(
      item =>
        item.Item_ID
    );

  const existing =
    (
      loadingStrategy.sequence ||
      []
    ).filter(
      id =>
        ids.includes(
          id
        )
    );

  ids.forEach(
    id => {
      if (
        !existing.includes(
          id
        )
      ) {
        existing.push(
          id
        );
      }
    }
  );

  loadingStrategy.sequence =
    existing;
}


function renderStrategyControls() {
  const groups = {
    weightMode:
      loadingStrategy.weightMode,

    frontBackMode:
      loadingStrategy.frontBackMode,

    lateralMode:
      loadingStrategy.lateralMode,

    orientationMode:
      loadingStrategy.orientationMode
  };

  Object.entries(
    groups
  ).forEach(
    ([name, value]) => {
      const input =
        document.querySelector(
          `input[name="${name}"][value="${value}"]`
        );

      if (input) {
        input.checked = true;
      }
    }
  );

  const summary =
    document.getElementById(
      'strategySummary'
    );

  if (summary) {
    summary.textContent =
      strategySummaryText();
  }
}


function renderCustomSequence() {
  const list =
    document.getElementById(
      'customSequenceList'
    );

  if (!list) {
    return;
  }

  if (!items.length) {
    list.innerHTML =
      `
      <div class="empty-state">
        Add cargo to configure a custom loading sequence.
      </div>
      `;

    return;
  }

  list.innerHTML =
    '';

  loadingStrategy.sequence
    .forEach(
      (
        itemId,
        index
      ) => {
        const item =
          items.find(
            cargo =>
              cargo.Item_ID ===
              itemId
          );

        if (!item) {
          return;
        }

        const row =
          document.createElement(
            'div'
          );

        row.className =
          'sequence-row';

        row.innerHTML =
          `
          <div class="sequence-index">
            ${index + 1}
          </div>

          <span
            class="colour-dot"
            style="
              background:
              ${escapeHtml(
                item.Colour
              )}
            "
          ></span>

          <div class="sequence-name">
            ${escapeHtml(
              item.Product_Name
            )}
          </div>

          <div class="sequence-weight">
            ${formatDecimal(
              weightFromKG(
                item.Gross_Weight_Kg
              ),
              2
            )} ${weightLabel()}/pkg
          </div>

          <button
            class="sequence-btn move-up"
            type="button"
            title="Move earlier"
            ${index === 0 ? 'disabled' : ''}
          >
            ↑
          </button>

          <button
            class="sequence-btn move-down"
            type="button"
            title="Move later"
            ${
              index ===
              loadingStrategy.sequence.length - 1
                ? 'disabled'
                : ''
            }
          >
            ↓
          </button>
          `;

        row
          .querySelector(
            '.move-up'
          )
          .addEventListener(
            'click',
            () =>
              moveSequenceItem(
                itemId,
                -1
              )
          );

        row
          .querySelector(
            '.move-down'
          )
          .addEventListener(
            'click',
            () =>
              moveSequenceItem(
                itemId,
                1
              )
          );

        list.appendChild(
          row
        );
      }
    );
}


function moveSequenceItem(
  itemId,
  direction
) {
  const index =
    loadingStrategy.sequence
      .indexOf(
        itemId
      );

  const target =
    index +
    direction;

  if (
    index <
    0 ||
    target <
    0 ||
    target >=
    loadingStrategy.sequence.length
  ) {
    return;
  }

  const copy =
    [
      ...loadingStrategy.sequence
    ];

  [
    copy[index],
    copy[target]
  ] =
  [
    copy[target],
    copy[index]
  ];

  loadingStrategy.sequence =
    copy;

  loadingStrategy.weightMode =
    'sequence';

  saveStrategyForPlan();

  refreshEverything();

  showToast(
    'Custom loading sequence updated.'
  );
}


function resetLoadingStrategy() {
  loadingStrategy = {
    weightMode:
      'auto',

    frontBackMode:
      'back-first',

    lateralMode:
      'left-first',

    orientationMode:
      'auto-mix',

    sequence:
      items.map(
        item =>
          item.Item_ID
      )
  };

  saveStrategyForPlan();

  refreshEverything();

  showToast(
    'Loading strategy reset.'
  );
}


function strategySummaryText() {
  const weight = {
    auto:
      'Heavy Below',

    'floor-first':
      'Heavy Floor First',

    sequence:
      'Custom Sequence'
  }[
    loadingStrategy.weightMode
  ];

  const frontBack = {
    'back-first':
      'Back → Front',

    'front-first':
      'Front → Back',

    balanced:
      'Balanced Length'
  }[
    loadingStrategy.frontBackMode
  ];

  const lateral = {
    'left-first':
      'Left → Right',

    'right-first':
      'Right → Left',

    balanced:
      'Balanced Width'
  }[
    loadingStrategy.lateralMode
  ];

  const orientation =
    loadingStrategy.orientationMode ===
    'auto-mix'
      ? 'Auto Mix'
      : 'Per Item';

  return (
    `${weight} · ` +
    `${frontBack} · ` +
    `${lateral} · ` +
    `${orientation}`
  );
}


function getStrategySortedItems() {
  const copy =
    [
      ...items
    ];

  if (
    loadingStrategy.weightMode ===
    'sequence'
  ) {
    const order =
      new Map(
        loadingStrategy.sequence
          .map(
            (
              id,
              index
            ) => [
              id,
              index
            ]
          )
      );

    return copy.sort(
      (a, b) =>
        (
          order.get(
            a.Item_ID
          ) ??
          999999
        ) -
        (
          order.get(
            b.Item_ID
          ) ??
          999999
        )
    );
  }

  /*
    Both automatic modes are heavy-first. The difference is in
    free-space priority: floor-first strongly exhausts low spaces.
  */
  return copy.sort(
    (a, b) => {
      const weightDiff =
        Number(
          b.Gross_Weight_Kg ||
          0
        ) -
        Number(
          a.Gross_Weight_Kg ||
          0
        );

      if (
        Math.abs(
          weightDiff
        ) >
        0.0001
      ) {
        return weightDiff;
      }

      return (
        Number(
          a.Loading_Order ||
          0
        ) -
        Number(
          b.Loading_Order ||
          0
        )
      );
    }
  );
}


function strategyVerticalScore(
  space
) {
  if (
    loadingStrategy.weightMode ===
    'floor-first'
  ) {
    /*
      Very strong preference for every remaining floor-level space
      before any upper free-space is considered.
    */
    return (
      space.z <=
      0.001
        ? 0
        : 1000000 +
          roundScore(
            space.z
          )
    );
  }

  return roundScore(
    space.z
  );
}


function strategyLongitudinalScore(
  space,
  orientation,
  container
) {
  const mode =
    loadingStrategy.frontBackMode;

  /*
    Coordinate convention:
      x = 0              -> BACK WALL
      x = container.L    -> DOOR / FRONT
  */

  if (
    mode ===
    'front-first'
  ) {
    return roundScore(
      container.L -
      (
        space.x +
        orientation.l
      )
    );
  }

  if (
    mode ===
    'balanced'
  ) {
    const boxCentre =
      space.x +
      orientation.l /
      2;

    return roundScore(
      Math.abs(
        boxCentre -
        container.L /
        2
      )
    );
  }

  return roundScore(
    space.x
  );
}


function strategyLateralScore(
  space,
  orientation,
  container
) {
  const mode =
    loadingStrategy.lateralMode;

  /*
    Coordinate convention:
      y = 0              -> LEFT WALL
      y = container.W    -> RIGHT WALL
  */

  if (
    mode ===
    'right-first'
  ) {
    return roundScore(
      container.W -
      (
        space.y +
        orientation.w
      )
    );
  }

  if (
    mode ===
    'balanced'
  ) {
    const boxCentre =
      space.y +
      orientation.w /
      2;

    return roundScore(
      Math.abs(
        boxCentre -
        container.W /
        2
      )
    );
  }

  return roundScore(
    space.y
  );
}


function strategyLongitudinalPointScore(
  space,
  container
) {
  const mode =
    loadingStrategy.frontBackMode;

  if (
    mode ===
    'front-first'
  ) {
    return (
      container.L -
      (
        space.x +
        space.l
      )
    );
  }

  if (
    mode ===
    'balanced'
  ) {
    return Math.abs(
      (
        space.x +
        space.l /
        2
      ) -
      container.L /
      2
    );
  }

  return space.x;
}


function strategyLateralPointScore(
  space,
  container
) {
  const mode =
    loadingStrategy.lateralMode;

  if (
    mode ===
    'right-first'
  ) {
    return (
      container.W -
      (
        space.y +
        space.w
      )
    );
  }

  if (
    mode ===
    'balanced'
  ) {
    return Math.abs(
      (
        space.y +
        space.w /
        2
      ) -
      container.W /
      2
    );
  }

  return space.y;
}


/* =========================================================
   FIT RESULTS
========================================================= */

function renderFitResults(result) {
  if (
    !result.results.length
  ) {
    fitResults.innerHTML =
      `
      <div class="empty-state">
        Add cargo to calculate the loading arrangement.
      </div>
      `;

    return;
  }

  fitResults.innerHTML =
    result.results
      .map(row => {
        const itemVolumeCBM =
          (
            Number(
              row.item.Length_mm
            ) *
            Number(
              row.item.Width_mm
            ) *
            Number(
              row.item.Height_mm
            ) *
            Number(
              row.requested
            )
          ) /
          1000000000;

        const breakdownHtml =
          row.breakdown?.length
            ? row.breakdown
                .map(
                  entry => `
                    <span class="breakdown-chip">
                      <strong>${formatNumber(entry.count)}</strong>
                      ${escapeHtml(
                        entry.type === 'default'
                          ? 'Default'
                          : entry.type === 'floor'
                            ? 'Floor'
                            : 'Side'
                      )}
                    </span>
                  `
                )
                .join('')
            : '—';

        return `
        <div class="fit-row mixed-fit-row">

          <div class="fit-name">
            <span
              class="colour-dot"
              style="
                background:
                ${escapeHtml(
                  displayColour(
                    row.item
                  )
                )}
              "
            ></span>

            <div>
              <strong>
                ${escapeHtml(
                  row.item.Product_Name
                )}
              </strong>

              <div class="breakdown-chips">
                <span class="breakdown-chip placement-chip">
                  ${escapeHtml(
                    placementLabel(
                      row.rule?.placement ||
                      'auto'
                    )
                  )}
                </span>
                ${breakdownHtml}
              </div>
            </div>
          </div>

          <div class="fit-number">
            <span>Packages</span>
            <strong>
              ${formatNumber(
                row.requested
              )}
            </strong>
          </div>

          <div class="fit-number">
            <span>Fits</span>
            <strong>
              ${formatNumber(
                row.fitted
              )}
            </strong>
          </div>

          <div class="fit-number">
            <span>Volume</span>
            <strong>
              ${formatDecimal(
                itemVolumeCBM,
                2
              )} CBM
            </strong>
          </div>

          <div class="fit-status">
            ${
              row.remaining > 0
                ? `<span class="status-warning">${formatNumber(row.remaining)} left · ${row.stopReason === 'payload' || row.stopReason === 'payload-reserved' ? 'Payload allocation' : 'Space / placement limit'}</span>`
                : `<span class="status-ok">ALL LOADED</span>`
            }
          </div>

        </div>
        `;
      })
      .join('');
}


/* =========================================================
   CONTAINER DIMENSIONS
========================================================= */

function renderContainerDimensions(totals) {
  const container =
    selectedContainer();

  if (!container) {
    return;
  }

  const length =
    formatDimension(
      container.Internal_Length_mm
    );

  const width =
    formatDimension(
      container.Internal_Width_mm
    );

  const height =
    formatDimension(
      container.Internal_Height_mm
    );

  const unit =
    dimensionLabel();

  document
    .getElementById('dimLength')
    .textContent =
      `Inner Length: ${length} ${unit}`;

  document
    .getElementById('dimWidth')
    .textContent =
      `Inner Width: ${width} ${unit}`;

  document
    .getElementById('dimHeight')
    .textContent =
      `Inner Height: ${height} ${unit}`;

  document
    .getElementById('specContainerName')
    .textContent =
      `${container.Container_Name} · Internal`;

  document
    .getElementById('specLength')
    .textContent =
      `${length} ${unit}`;

  document
    .getElementById('specWidth')
    .textContent =
      `${width} ${unit}`;

  document
    .getElementById('specHeight')
    .textContent =
      `${height} ${unit}`;

  document
    .getElementById('specVolume')
    .textContent =
      `${formatDecimal(
        totals.containerCBM,
        2
      )} CBM`;

  document
    .getElementById('specPayload')
    .textContent =
      `${formatDecimal(
        weightFromKG(
          totals.maxPayloadKG
        ),
        0
      )} ${weightLabel()}`;
}


/* =========================================================
   UTILISATION
========================================================= */

function renderUtilisation(totals) {
  const volumePct =
    clamp(
      totals.volumePct,
      0,
      100
    );

  const payloadPct =
    clamp(
      totals.payloadPct,
      0,
      100
    );

  document
    .getElementById('utilVolumePct')
    .textContent =
      `${formatDecimal(
        totals.volumePct,
        1
      )}%`;

  document
    .getElementById('utilPayloadPct')
    .textContent =
      `${formatDecimal(
        totals.payloadPct,
        1
      )}%`;

  document
    .getElementById('utilVolumeBar')
    .style.width =
      `${volumePct}%`;

  document
    .getElementById('utilPayloadBar')
    .style.width =
      `${payloadPct}%`;

  document
    .getElementById('utilVolumeText')
    .textContent =
      `${formatDecimal(
        totals.cbm,
        2
      )} / ${formatDecimal(
        totals.containerCBM,
        2
      )} CBM`;

  document
    .getElementById('utilPayloadText')
    .textContent =
      `${formatDecimal(
        weightFromKG(
          totals.weightKG
        ),
        0
      )} / ${formatDecimal(
        weightFromKG(
          totals.maxPayloadKG
        ),
        0
      )} ${weightLabel()}`;

  const remainingVolume =
    Math.max(
      0,
      100 -
      totals.volumePct
    );

  const remainingPayload =
    Math.max(
      0,
      totals.maxPayloadKG -
      totals.weightKG
    );

  document
    .getElementById('remainingNote')
    .textContent =
      `${formatDecimal(
        remainingVolume,
        1
      )}% volume remaining · ${formatDecimal(
        weightFromKG(
          remainingPayload
        ),
        0
      )} ${weightLabel()} payload remaining`;
}


function renderCapacityGuard(
  result,
  totals
) {
  const note =
    document.getElementById(
      'capacityGuardNote'
    );

  if (!note) {
    return;
  }

  const requested =
    result.results.reduce(
      (
        sum,
        row
      ) =>
        sum +
        Number(
          row.requested ||
          0
        ),
      0
    );

  const loaded =
    result.results.reduce(
      (
        sum,
        row
      ) =>
        sum +
        Number(
          row.fitted ||
          0
        ),
      0
    );

  const remaining =
    Math.max(
      0,
      requested -
      loaded
    );

  const payloadStop =
    result.results.some(
      row =>
        row.stopReason ===
        'payload' &&
        row.remaining >
        0
    );

  const spaceStop =
    result.results.some(
      row =>
        row.stopReason ===
        'space' &&
        row.remaining >
        0
    );

  note.classList.toggle(
    'capacity-guard-ok',
    remaining === 0
  );

  note.innerHTML =
    `
      <strong>Capacity Guard:</strong>
      ${formatNumber(
        loaded
      )} of ${formatNumber(
        requested
      )} packages loaded.
      ${remaining
        ? `${formatNumber(remaining)} remain outside the container.`
        : 'All requested packages fit.'}
      <span>
        Volume ${formatDecimal(
          totals.volumePct,
          1
        )}% ·
        Payload ${formatDecimal(
          totals.payloadPct,
          1
        )}%${payloadStop ? ' · Payload limit reached' : ''}${spaceStop ? ' · Space limit reached' : ''}
      </span>
    `;
}


/* =========================================================
   THREE.JS
========================================================= */

function initThree() {
  scene =
    new THREE.Scene();

  scene.background =
    new THREE.Color(
      0xf7f9fc
    );

  camera =
    new THREE.PerspectiveCamera(
      38,
      1,
      0.01,
      100
    );

  renderer =
    new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });

  // 1.5x is visually crisp while avoiding the large GPU cost of 2x on Retina displays.
  renderer.setPixelRatio(
    Math.min(
      window.devicePixelRatio,
      1.5
    )
  );

  // The engineering line-frame view does not need realtime shadows.
  renderer.shadowMap.enabled = false;

  viewer.appendChild(
    renderer.domElement
  );

  viewerLoading.classList.add(
    'hidden'
  );

  renderer.domElement.addEventListener(
    'click',
    event => {
      const activeItemId = activeManualItemId();
      if (!activeItemId) {
        return;
      }

      const item =
        items.find(
          cargo =>
            cargo.Item_ID === activeItemId
        );

      const container =
        selectedContainer();

      if (
        !item ||
        !container
      ) {
        return;
      }

      const rect =
        renderer.domElement
          .getBoundingClientRect();

      const pointer =
        new THREE.Vector2(
          (
            (
              event.clientX -
              rect.left
            ) /
            rect.width
          ) *
            2 -
            1,

          -(
            (
              event.clientY -
              rect.top
            ) /
            rect.height
          ) *
            2 +
            1
        );

      const raycaster =
        new THREE.Raycaster();

      raycaster.setFromCamera(
        pointer,
        camera
      );

      const gizmoHit = raycaster.intersectObjects(manualGizmoTargets, false)[0];
      if (gizmoHit?.object?.userData?.manualMove) {
        const move = gizmoHit.object.userData.manualMove;
        moveManualZoneByFoot(move.itemId, move.axis, move.delta);
        return;
      }

      const floorPlane =
        new THREE.Plane(
          new THREE.Vector3(
            0,
            1,
            0
          ),
          0
        );

      const hit =
        new THREE.Vector3();

      if (
        !raycaster.ray.intersectPlane(
          floorPlane,
          hit
        )
      ) {
        return;
      }

      const L =
        Number(
          container.Internal_Length_mm ||
          0
        );

      const W =
        Number(
          container.Internal_Width_mm ||
          0
        );

      const scale =
        L
          ? 10 /
            L
          : 1;

      const xMM =
        hit.x /
        scale;

      const yMM =
        hit.z /
        scale;

      if (
        xMM <
          0 ||
        yMM <
          0 ||
        xMM >
          L ||
        yMM >
          W
      ) {
        return;
      }

      const xFt =
        Math.floor(
          xMM /
          ONE_FOOT_MM
        );

      const yFt =
        Math.floor(
          yMM /
          ONE_FOOT_MM
        );

      productPlacementRules[
        item.Item_ID
      ] = {
        ...getProductRule(
          item
        ),

        zoneXFt:
          xFt,

        zoneYFt:
          yFt
      };

      saveProductPlacementRules();
      refreshEverything();

      showToast(
        `Start cube set: X ${xFt} ft · Y ${yFt} ft.`
      );
    }
  );

  controls =
    new OrbitControls(
      camera,
      renderer.domElement
    );

  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.autoRotateSpeed = 1.2;

  scene.add(
    new THREE.HemisphereLight(
      0xffffff,
      0x7a879a,
      2.1
    )
  );

  const keyLight =
    new THREE.DirectionalLight(
      0xffffff,
      2.4
    );

  keyLight.position.set(
    8,
    10,
    8
  );

  keyLight.castShadow = false;

  scene.add(keyLight);

  const fillLight =
    new THREE.DirectionalLight(
      0xc8d6ff,
      1.2
    );

  fillLight.position.set(
    -6,
    5,
    -4
  );

  scene.add(fillLight);

  cargoGroup =
    new THREE.Group();

  scene.add(cargoGroup);

  resizeViewer();

  window.addEventListener(
    'resize',
    resizeViewer
  );

  animate();
}


function render3D(
  result
) {
  if (!renderer) {
    return;
  }

  clearGroup(
    cargoGroup
  );
  manualGizmoTargets = [];

  const container =
    selectedContainer();

  if (!container) {
    return;
  }

  const L =
    Number(
      container.Internal_Length_mm
    );

  const W =
    Number(
      container.Internal_Width_mm
    );

  const H =
    Number(
      container.Internal_Height_mm
    );

  const scale =
    10 /
    L;

  const scaledL =
    L *
    scale;

  const scaledW =
    W *
    scale;

  const scaledH =
    H *
    scale;


  /* GROUND */

  const grid =
    new THREE.GridHelper(
      16,
      32,
      0xd4dbe5,
      0xe7ebf1
    );

  grid.position.set(
    scaledL /
      2,
    -0.05,
    scaledW /
      2
  );

  cargoGroup.add(
    grid
  );


  /* DETAILED CONTAINER */

  const containerModel =
    buildDetailedContainer(
      scaledL,
      scaledW,
      scaledH
    );

  cargoGroup.add(
    containerModel
  );


  /* 1 FT MANUAL / GUIDED GRID + SELECTED PRODUCT ZONE */

  const hasManualLayout =
    items.some(
      item =>
        getProductRule(
          item
        ).layoutMode !==
        'auto'
    );

  if (
    hasManualLayout ||
    manualGridVisible
  ) {
    const oneFootScaled =
      ONE_FOOT_MM *
      scale;

    const gridMaterial =
      new THREE.LineBasicMaterial({
        color:
          0x8ea0b5,

        transparent:
          true,

        opacity:
          0.30
      });

    for (
      let x =
        oneFootScaled;
      x <
        scaledL -
        0.001;
      x +=
        oneFootScaled
    ) {
      const line =
        new THREE.Line(
          new THREE.BufferGeometry()
            .setFromPoints([
              new THREE.Vector3(
                x,
                0.008,
                0
              ),
              new THREE.Vector3(
                x,
                0.008,
                scaledW
              )
            ]),
          gridMaterial
        );

      cargoGroup.add(
        line
      );
    }

    for (
      let z =
        oneFootScaled;
      z <
        scaledW -
        0.001;
      z +=
        oneFootScaled
    ) {
      const line =
        new THREE.Line(
          new THREE.BufferGeometry()
            .setFromPoints([
              new THREE.Vector3(
                0,
                0.008,
                z
              ),
              new THREE.Vector3(
                scaledL,
                0.008,
                z
              )
            ]),
          gridMaterial
        );

      cargoGroup.add(
        line
      );
    }
  }

  const selectedManualItemId = activeManualItemId();
  const selectedManualItem =
    items.find(
      item => item.Item_ID === selectedManualItemId
    );

  if (
    selectedManualItem
  ) {
    const zone =
      manualZoneForItem(
        selectedManualItem,
        {
          L,
          W,
          H
        }
      );

    const zoneGeometry =
      new THREE.BoxGeometry(
        zone.l *
        scale,
        zone.h *
        scale,
        zone.w *
        scale
      );

    const zoneMaterial =
      new THREE.MeshBasicMaterial({
        color:
          displayColour(
            selectedManualItem
          ),

        transparent:
          true,

        opacity:
          0.13,

        depthWrite:
          false
      });

    const zoneMesh =
      new THREE.Mesh(
        zoneGeometry,
        zoneMaterial
      );

    zoneMesh.position.set(
      (
        zone.x +
        zone.l /
        2
      ) *
      scale,

      (
        zone.z +
        zone.h /
        2
      ) *
      scale,

      (
        zone.y +
        zone.w /
        2
      ) *
      scale
    );

    const zoneEdges =
      new THREE.LineSegments(
        new THREE.EdgesGeometry(
          zoneGeometry
        ),

        new THREE.LineBasicMaterial({
          color:
            displayColour(
              selectedManualItem
            ),

          transparent:
            true,

          opacity:
            0.90
        })
      );

    zoneMesh.add(
      zoneEdges
    );

    cargoGroup.add(
      zoneMesh
    );

    const cubeSize =
      Math.min(
        ONE_FOOT_MM,
        L -
          zone.x,
        W -
          zone.y,
        H -
          zone.z
      );

    if (
      cubeSize >
      0
    ) {
      const cube =
        new THREE.Mesh(
          new THREE.BoxGeometry(
            cubeSize *
            scale,
            cubeSize *
            scale,
            cubeSize *
            scale
          ),

          new THREE.MeshBasicMaterial({
            color:
              displayColour(
                selectedManualItem
              ),

            transparent:
              true,

            opacity:
              0.28,

            depthWrite:
              false
          })
        );

      cube.position.set(
        (
          zone.x +
          cubeSize /
          2
        ) *
        scale,

        (
          zone.z +
          cubeSize /
          2
        ) *
        scale,

        (
          zone.y +
          cubeSize /
          2
        ) *
        scale
      );

      cargoGroup.add(
        cube
      );
    }
  }


  /* DIRECT MANUAL / GUIDED MOVE ARROWS */

  if (false && selectedManualItem) {
    const zone = manualZoneForItem(selectedManualItem, { L, W, H });
    const arrowLength = Math.max(0.62, Math.min(1.05, ONE_FOOT_MM * scale * 1.35));
    const gap = Math.max(0.08, arrowLength * 0.18);
    const cx = (zone.x + zone.l / 2) * scale;
    const cy = Math.min(scaledH - 0.05, (zone.z + zone.h) * scale + 0.10);
    const cz = (zone.y + zone.w / 2) * scale;

    // Length axis: BACK ↔ DOORS
    addManualMoveArrow(
      new THREE.Vector3((zone.x + zone.l) * scale + gap, cy, cz),
      new THREE.Vector3(1, 0, 0), arrowLength, 0x2563eb,
      selectedManualItem.Item_ID, 'x', 1
    );
    addManualMoveArrow(
      new THREE.Vector3(zone.x * scale - gap, cy, cz),
      new THREE.Vector3(-1, 0, 0), arrowLength, 0x2563eb,
      selectedManualItem.Item_ID, 'x', -1
    );

    // Width axis: LEFT ↔ RIGHT
    addManualMoveArrow(
      new THREE.Vector3(cx, cy, (zone.y + zone.w) * scale + gap),
      new THREE.Vector3(0, 0, 1), arrowLength, 0x16a34a,
      selectedManualItem.Item_ID, 'y', 1
    );
    addManualMoveArrow(
      new THREE.Vector3(cx, cy, zone.y * scale - gap),
      new THREE.Vector3(0, 0, -1), arrowLength, 0x16a34a,
      selectedManualItem.Item_ID, 'y', -1
    );

    // Height axis: DOWN ↕ UP
    addManualMoveArrow(
      new THREE.Vector3(cx, (zone.z + zone.h) * scale + gap, cz),
      new THREE.Vector3(0, 1, 0), arrowLength, 0xf59e0b,
      selectedManualItem.Item_ID, 'z', 1
    );
    addManualMoveArrow(
      new THREE.Vector3(cx, zone.z * scale - gap, cz),
      new THREE.Vector3(0, -1, 0), arrowLength, 0xf59e0b,
      selectedManualItem.Item_ID, 'z', -1
    );
  }


  /* TRUE 3D DIMENSIONS */

  if (
    showSceneDimensions
  ) {
    const dimensionGroup =
      new THREE.Group();

    const dimensionColour =
      0x24579a;

    addDimensionLine(
      dimensionGroup,

      new THREE.Vector3(
        0,
        scaledH +
          0.48,
        -0.2
      ),

      new THREE.Vector3(
        scaledL,
        scaledH +
          0.48,
        -0.2
      ),

      `L · ${formatDimension(
        L
      )} ${dimensionLabel()}`,

      dimensionColour
    );

    addDimensionLine(
      dimensionGroup,

      new THREE.Vector3(
        -0.42,
        0,
        -0.08
      ),

      new THREE.Vector3(
        -0.42,
        scaledH,
        -0.08
      ),

      `H · ${formatDimension(
        H
      )} ${dimensionLabel()}`,

      dimensionColour
    );

    addDimensionLine(
      dimensionGroup,

      new THREE.Vector3(
        -0.22,
        0.05,
        0
      ),

      new THREE.Vector3(
        -0.22,
        0.05,
        scaledW
      ),

      `W · ${formatDimension(
        W
      )} ${dimensionLabel()}`,

      dimensionColour
    );

    cargoGroup.add(
      dimensionGroup
    );
  }


  /* PRODUCT OCCUPANCY MARKERS */

  if (
    showOccupancyMarkers &&
    result
  ) {
    const occupancyRows =
      calculateProductOccupancy(
        result
      );

    occupancyRows.forEach(
      (
        row,
        index
      ) => {
        const y =
          scaledH +
          0.82 +
          index *
          0.20;

        const markerGroup =
          new THREE.Group();

        addOccupancyMarker(
          markerGroup,

          row.minX *
            scale,

          row.maxX *
            scale,

          y,

          -0.03,

          displayColour(
            row.item
          ),

          `${row.item.Product_Name} · ≈ ${formatDecimal(
            row.lengthFt,
            1
          )} ft`
        );

        cargoGroup.add(
          markerGroup
        );
      }
    );
  }


  /* CARGO BOXES — FAST INSTANCED RENDERING
     One InstancedMesh per colour/focus state replaces hundreds or thousands of
     individual Mesh + EdgesGeometry objects. The 2.8% spacing between cartons
     keeps every package visually readable without expensive per-box outlines. */

  const instanceGroups = new Map();

  result.placements.forEach((placement, placementIndex) => {
    const stepFocused = selectedLoadingPlacementIndices.size === 0 || selectedLoadingPlacementIndices.has(placementIndex);
    const productFocused = !highlightedItemId || highlightedItemId === placement.itemId;
    const isFocused = stepFocused && productFocused;

    const colour = placement.colour || '#64748B';
    const key = `${colour}|${isFocused ? 'focus' : 'dim'}`;

    if (!instanceGroups.has(key)) {
      instanceGroups.set(key, {
        colour,
        isFocused,
        placements: []
      });
    }

    instanceGroups.get(key).placements.push(placement);
  });

  const unitGeometry = new THREE.BoxGeometry(1, 1, 1);

  instanceGroups.forEach(group => {
    const material = new THREE.MeshLambertMaterial({
      color: group.colour,
      transparent: true,
      opacity: group.isFocused ? 0.96 : 0.12,
      depthWrite: group.isFocused
    });

    const mesh = new THREE.InstancedMesh(
      unitGeometry.clone(),
      material,
      group.placements.length
    );

    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const instanceScale = new THREE.Vector3();

    group.placements.forEach((placement, index) => {
      position.set(
        (placement.x + placement.l / 2) * scale,
        (placement.z + placement.h / 2) * scale,
        (placement.y + placement.w / 2) * scale
      );

      instanceScale.set(
        placement.l * scale * 0.972,
        placement.h * scale * 0.972,
        placement.w * scale * 0.972
      );

      matrix.compose(position, quaternion, instanceScale);
      mesh.setMatrixAt(index, matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    cargoGroup.add(mesh);
  });

  unitGeometry.dispose();


  applyView(
    currentView
  );

  renderRequested = true;
}


function buildDetailedContainer(
  L,
  W,
  H
) {
  // VISUAL-ONLY line-frame container.
  // Packing / stuffing calculations are not changed here.
  const group = new THREE.Group();

  const mat = new THREE.LineBasicMaterial({
    color: 0x5f6d7c,
    transparent: true,
    opacity: 0.78
  });

  const softMat = new THREE.LineBasicMaterial({
    color: 0xaeb8c4,
    transparent: true,
    opacity: 0.22
  });

  const pts = [
    [0,0,0],[L,0,0],[L,0,W],[0,0,W],
    [0,H,0],[L,H,0],[L,H,W],[0,H,W]
  ].map(p => new THREE.Vector3(...p));

  const edges = [
    [0,1],[1,2],[2,3],[3,0],
    [4,5],[5,6],[6,7],[7,4],
    [0,4],[1,5],[2,6],[3,7]
  ];

  edges.forEach(([a,b]) => {
    const geo = new THREE.BufferGeometry().setFromPoints([pts[a], pts[b]]);
    group.add(new THREE.Line(geo, mat));
  });

  // Subtle floor grid only.
  const lengthSteps = 20;
  const widthSteps = 6;

  for (let i = 1; i < lengthSteps; i++) {
    const x = L * i / lengthSteps;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 0.002, 0),
      new THREE.Vector3(x, 0.002, W)
    ]);
    group.add(new THREE.Line(geo, softMat));
  }

  for (let i = 1; i < widthSteps; i++) {
    const z = W * i / widthSteps;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.002, z),
      new THREE.Vector3(L, 0.002, z)
    ]);
    group.add(new THREE.Line(geo, softMat));
  }

  return group;
}


function addDimensionLine(
  group,
  start,
  end,
  label,
  colour
) {
  const material =
    new THREE.LineBasicMaterial({
      color:
        colour
    });

  const line =
    new THREE.Line(
      new THREE.BufferGeometry()
        .setFromPoints([
          start,
          end
        ]),
      material
    );

  group.add(
    line
  );

  const direction =
    new THREE.Vector3()
      .subVectors(
        end,
        start
      )
      .normalize();

  const arrowLength =
    0.10;

  [
    {
      point:
        start,
      dir:
        direction
    },
    {
      point:
        end,
      dir:
        direction.clone()
          .multiplyScalar(
            -1
          )
    }
  ].forEach(
    arrow => {
      const cone =
        new THREE.Mesh(
          new THREE.ConeGeometry(
            0.035,
            arrowLength,
            10
          ),
          new THREE.MeshBasicMaterial({
            color:
              colour
          })
        );

      const axis =
        new THREE.Vector3(
          0,
          1,
          0
        );

      cone.quaternion
        .setFromUnitVectors(
          axis,
          arrow.dir
        );

      cone.position.copy(
        arrow.point
      );

      cone.position.add(
        arrow.dir
          .clone()
          .multiplyScalar(
            arrowLength /
            2
          )
      );

      group.add(
        cone
      );
    }
  );

  const sprite =
    makeTextSprite(
      label,
      '#173d7b',
      'rgba(255,255,255,0.94)'
    );

  sprite.position
    .copy(
      start.clone()
        .add(
          end
        )
        .multiplyScalar(
          0.5
        )
    );

  sprite.position.y +=
    0.10;

  group.add(
    sprite
  );
}


function addOccupancyMarker(
  group,
  startX,
  endX,
  y,
  z,
  colour,
  label
) {
  const parsed =
    new THREE.Color(
      colour
    );

  const material =
    new THREE.LineBasicMaterial({
      color:
        parsed
    });

  const line =
    new THREE.Line(
      new THREE.BufferGeometry()
        .setFromPoints([
          new THREE.Vector3(
            startX,
            y,
            z
          ),
          new THREE.Vector3(
            endX,
            y,
            z
          )
        ]),
      material
    );

  group.add(
    line
  );

  [
    startX,
    endX
  ].forEach(
    x => {
      const tick =
        new THREE.Line(
          new THREE.BufferGeometry()
            .setFromPoints([
              new THREE.Vector3(
                x,
                y -
                  0.055,
                z
              ),
              new THREE.Vector3(
                x,
                y +
                  0.055,
                z
              )
            ]),
          material
        );

      group.add(
        tick
      );
    }
  );

  const sprite =
    makeTextSprite(
      label,
      colour,
      'rgba(255,255,255,0.93)'
    );

  sprite.position.set(
    (
      startX +
      endX
    ) /
      2,
    y +
      0.09,
    z
  );

  group.add(
    sprite
  );
}


function makeTextSprite(
  text,
  textColour =
    '#173d7b',
  background =
    'rgba(255,255,255,0.94)'
) {
  const canvas =
    document.createElement(
      'canvas'
    );

  const context =
    canvas.getContext(
      '2d'
    );

  const fontSize =
    34;

  context.font =
    `700 ${fontSize}px Arial`;

  const metrics =
    context.measureText(
      text
    );

  const paddingX =
    18;

  const paddingY =
    12;

  canvas.width =
    Math.ceil(
      metrics.width +
      paddingX *
      2
    );

  canvas.height =
    fontSize +
    paddingY *
    2;

  context.font =
    `700 ${fontSize}px Arial`;

  context.fillStyle =
    background;

  context.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  context.fillStyle =
    textColour;

  context.textBaseline =
    'middle';

  context.fillText(
    text,
    paddingX,
    canvas.height /
      2
  );

  const texture =
    new THREE.CanvasTexture(
      canvas
    );

  texture.needsUpdate =
    true;

  const material =
    new THREE.SpriteMaterial({
      map:
        texture,

      transparent:
        true,

      depthTest:
        false
    });

  const sprite =
    new THREE.Sprite(
      material
    );

  const aspect =
    canvas.width /
    canvas.height;

  const height =
    0.22;

  sprite.scale.set(
    height *
      aspect,
    height,
    1
  );

  return sprite;
}


function clearGroup(group) {
  while (
    group.children.length
  ) {
    const child =
      group.children[0];

    group.remove(child);

    child.traverse?.(
      node => {
        node.geometry
          ?.dispose?.();

        if (
          Array.isArray(
            node.material
          )
        ) {
          node.material.forEach(
            material =>
              material.dispose?.()
          );
        } else {
          node.material
            ?.dispose?.();
        }
      }
    );
  }
}


function applyView(view) {
  const container =
    selectedContainer();

  if (
    !container ||
    !controls
  ) {
    return;
  }

  currentView =
    view;

  renderRequested = true;

  document
    .querySelectorAll(
      '.view-tab'
    )
    .forEach(button => {
      button.classList.toggle(
        'active',
        button.dataset.view ===
        view
      );
    });

  const L = 10;

  const W =
    Number(
      container.Internal_Width_mm
    ) /
    Number(
      container.Internal_Length_mm
    ) *
    10;

  const H =
    Number(
      container.Internal_Height_mm
    ) /
    Number(
      container.Internal_Length_mm
    ) *
    10;

  const target =
    new THREE.Vector3(
      L / 2,
      H / 2,
      W / 2
    );

  controls.target.copy(target);

  if (view === 'top') {
    camera.position.set(
      L / 2,
      10,
      W / 2
    );
  } else if (view === 'side') {
    camera.position.set(
      L / 2,
      H / 2,
      8
    );
  } else if (view === 'front') {
    camera.position.set(
      -5.4,
      H / 2,
      W / 2
    );
  } else {
    camera.position.set(
      7.5,
      4.7,
      6.9
    );
  }

  camera.lookAt(
    target
  );

  controls.update();
}


function resetCamera() {
  applyView(
    currentView
  );
}


function resizeViewer() {
  if (
    !renderer ||
    !camera
  ) {
    return;
  }

  const width =
    viewer.clientWidth;

  if (!width) {
    return;
  }

  const height =
    width < 650
      ? 410
      : 535;

  renderer.setSize(
    width,
    height,
    false
  );

  camera.aspect =
    width / height;

  camera
    .updateProjectionMatrix();

  renderRequested = true;
}


function animate() {
  requestAnimationFrame(
    animate
  );

  let controlsChanged = false;

  if (controls) {
    controls.autoRotate =
      autoRotate &&
      currentView ===
      '3d';

    controlsChanged = Boolean(controls.update());
  }

  // Avoid redrawing the entire WebGL scene 60 times/second while nothing moves.
  if (renderer && (renderRequested || controlsChanged || (autoRotate && currentView === '3d'))) {
    renderer.render(
      scene,
      camera
    );
    renderRequested = false;
  }
}


/* =========================================================
   LEGEND
========================================================= */

function renderLegend() {
  legend.innerHTML =
    items
      .map(
        item => `
        <button
          class="legend-item legend-button ${highlightedItemId === item.Item_ID ? 'active' : ''}"
          data-item-id="${escapeHtml(
            item.Item_ID
          )}"
          type="button"
          title="Highlight ${escapeHtml(
            item.Product_Name
          )}"
        >
          <span
            class="legend-colour"
            style="
              background:
              ${escapeHtml(
                displayColour(
                  item
                )
              )}
            "
          ></span>

          <span>
            ${escapeHtml(
              item.Product_Name
            )}
            (${formatNumber(
              item.Quantity
            )})
          </span>
        </button>
      `
      )
      .join('');

  legend
    .querySelectorAll(
      '.legend-button'
    )
    .forEach(
      button => {
        button.addEventListener(
          'click',
          () =>
            toggleProductFocus(
              button.dataset.itemId
            )
        );
      }
    );
}


function renderOccupancyList(
  result
) {
  const list =
    document.getElementById(
      'occupancyList'
    );

  if (!list) {
    return;
  }

  if (
    !result ||
    !result.placements.length
  ) {
    list.innerHTML =
      `
      <div class="occupancy-empty">
        No loaded cargo.
      </div>
      `;

    return;
  }

  const rows =
    calculateProductOccupancy(
      result
    );

  list.innerHTML =
    rows
      .map(
        row => `
        <button
          class="occupancy-row ${highlightedItemId === row.item.Item_ID ? 'active' : ''}"
          data-item-id="${escapeHtml(
            row.item.Item_ID
          )}"
          type="button"
        >
          <span
            class="occupancy-dot"
            style="background:${escapeHtml(
              displayColour(
                row.item
              )
            )}"
          ></span>

          <span class="occupancy-name">
            ${escapeHtml(
              row.item.Product_Name
            )}
          </span>

          <strong>
            ${formatDecimal(
              row.startFt,
              1
            )}–${formatDecimal(
              row.endFt,
              1
            )} ft
          </strong>

          <small>
            ≈ ${formatDecimal(
              row.lengthFt,
              1
            )} ft occupied
          </small>
        </button>
      `
      )
      .join('');

  list
    .querySelectorAll(
      '.occupancy-row'
    )
    .forEach(
      button => {
        button.addEventListener(
          'click',
          () =>
            toggleProductFocus(
              button.dataset.itemId
            )
        );
      }
    );
}


function calculateProductOccupancy(
  result
) {
  return items
    .map(
      item => {
        const placements =
          result.placements.filter(
            placement =>
              placement.itemId ===
              item.Item_ID
          );

        if (
          !placements.length
        ) {
          return null;
        }

        const minX =
          Math.min(
            ...placements.map(
              placement =>
                placement.x
            )
          );

        const maxX =
          Math.max(
            ...placements.map(
              placement =>
                placement.x +
                placement.l
            )
          );

        return {
          item,
          minX,
          maxX,
          startFt:
            minX /
            304.8,

          endFt:
            maxX /
            304.8,

          lengthFt:
            (
              maxX -
              minX
            ) /
            304.8
        };
      }
    )
    .filter(Boolean);
}


/* =========================================================
   PRINT
========================================================= */

function uniqueAxisCount(values, tolerance = 4) {
  const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b);
  if (!sorted.length) return 0;
  let count = 1;
  let anchor = sorted[0];
  for (let i=1;i<sorted.length;i++) {
    if (Math.abs(sorted[i]-anchor) > tolerance) {
      count++;
      anchor = sorted[i];
    }
  }
  return count;
}

function loadingStepPattern(step) {
  const ps = step?.placements || [];
  if (!ps.length) return '—';
  const deep = uniqueAxisCount(ps.map(p=>p.x));
  const across = uniqueAxisCount(ps.map(p=>p.y));
  const layers = uniqueAxisCount(ps.map(p=>p.z));
  const parts = [`${across} across`, `${deep} deep`];
  if (layers > 1) parts.push(`${layers} layers`);
  return parts.join(' × ');
}

function printStepSvg(step, priorIndices, view = 'top') {
  const container = selectedContainer();
  const L = Number(container?.Internal_Length_mm || 1);
  const W = Number(container?.Internal_Width_mm || 1);
  const H = Number(container?.Internal_Height_mm || 1);
  const placements = packingResult?.placements || [];
  const current = new Set(step?.indices || []);
  const prior = priorIndices || new Set();
  const colour = displayColour(step.item) || '#438d35';
  const width = 920, height = 260, left = 58, right = 58, top = 34, bottom = 48;
  const iw = width-left-right, ih = height-top-bottom;
  const rects = [];
  const safe = v => Number.isFinite(Number(v)) ? Number(v) : 0;

  const pushRect = (p, fill, opacity, stroke, sw) => {
    let x,y,w,h;
    if (view === 'top') {
      x = left + (safe(p.x)/L)*iw;
      y = top + (safe(p.y)/W)*ih;
      w = Math.max(1.5,(safe(p.l)/L)*iw);
      h = Math.max(1.5,(safe(p.w)/W)*ih);
    } else {
      x = left + (safe(p.y)/W)*iw;
      y = top + ih - ((safe(p.z)+safe(p.h))/H)*ih;
      w = Math.max(1.5,(safe(p.w)/W)*iw);
      h = Math.max(1.5,(safe(p.h)/H)*ih);
    }
    rects.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="1.5" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${sw}"/>`);
  };

  placements.forEach((p,index)=>{
    if (prior.has(index)) pushRect(p,'#94a3b8',0.23,'#64748b',0.45);
  });
  placements.forEach((p,index)=>{
    if (current.has(index)) pushRect(p,colour,0.92,'#17331b',0.8);
  });

  const labels = view === 'top'
    ? `<text x="${left}" y="${height-13}" font-size="14" font-weight="800">BACK</text><text x="${width-right}" y="${height-13}" font-size="14" font-weight="800" text-anchor="end">DOORS</text><path d="M ${left+52} ${height-18} H ${width-right-58}" stroke="#17331b" stroke-width="1.5"/><path d="M ${width-right-58} ${height-18} l -9 -5 v 10 z" fill="#17331b"/>`
    : `<text x="${left}" y="${height-13}" font-size="13" font-weight="800">LEFT WALL</text><text x="${width-right}" y="${height-13}" font-size="13" font-weight="800" text-anchor="end">RIGHT WALL</text>`;
  const title = view === 'top' ? 'TOP VIEW — POSITION ALONG CONTAINER' : 'SECTION VIEW — STACK ACROSS WIDTH';
  return `<svg class="print-step-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><text x="${left}" y="19" font-size="13" font-weight="900" fill="#17331b">${title}</text><rect x="${left}" y="${top}" width="${iw}" height="${ih}" rx="4" fill="#fff" stroke="#17331b" stroke-width="2"/>${rects.join('')}${labels}</svg>`;
}

function printStepInstruction(step) {
  const notes = [];
  if (step.level === 'FLOOR') notes.push('Place on the container floor and keep the base tight and level.');
  else notes.push('Confirm the supporting lower load is complete and stable before stacking this step.');
  if (step.side === 'LEFT') notes.push('Work from the left wall toward the centre.');
  if (step.side === 'RIGHT') notes.push('Work from the right wall toward the centre.');
  if (step.side === 'CENTRE') notes.push('Keep this block centred across the available width.');
  notes.push('Close avoidable gaps; secure any operational void before proceeding.');
  return notes.join(' ');
}

function preparePrint() {
  if (!plan || !items.length) {
    alert('Add at least one cargo item before printing.');
    return;
  }

  showGlobalLoader('Preparing warehouse loading sheet…','Building the packing list, visual loading steps and final verification.');

  const image = document.getElementById('print3dImage');
  const savedStepId = selectedLoadingStepId;
  const savedPlacementSelection = new Set(selectedLoadingPlacementIndices || []);
  try {
    selectedLoadingStepId = '';
    selectedLoadingPlacementIndices = new Set();
    render3D(packingResult);
    image.src = renderer.domElement.toDataURL('image/png');
  } catch (_) {
    image.removeAttribute('src');
  } finally {
    selectedLoadingStepId = savedStepId;
    selectedLoadingPlacementIndices = savedPlacementSelection;
    render3D(packingResult);
  }

  const container = selectedContainer();
  const resultMap = new Map((packingResult?.results || []).map(r => [r.item.Item_ID, r]));
  const printSteps = buildLoadingSteps(packingResult);
  const stepQtyByItem = new Map();
  printSteps.forEach(step=>stepQtyByItem.set(step.item.Item_ID,(stepQtyByItem.get(step.item.Item_ID)||0)+step.qty));

  let requestedTotal=0, plannedTotal=0, shortTotal=0, grossKg=0, cbmTotal=0;
  const packingRows = items.map((item,index)=>{
    const row=resultMap.get(item.Item_ID);
    const requested=Number(row?.requested ?? item.Quantity ?? 0);
    const planned=Number(row?.fitted || 0);
    const short=Math.max(0,requested-planned);
    const unitKg=Number(item.Gross_Weight_Kg||0);
    const totalKg=planned*unitKg;
    const unitCBM=Number(item.Length_mm||0)*Number(item.Width_mm||0)*Number(item.Height_mm||0)/1e9;
    const totalCBM=planned*unitCBM;
    const sequenced=stepQtyByItem.get(item.Item_ID)||0;
    const reconciled=sequenced===planned;
    requestedTotal+=requested;plannedTotal+=planned;shortTotal+=short;grossKg+=totalKg;cbmTotal+=totalCBM;
    return {item,index,requested,planned,short,unitKg,totalKg,totalCBM,sequenced,reconciled};
  });
  const payloadExceeded=Number(packingResult?.maxPayloadKG||0)>0&&Number(packingResult?.loadedPayloadKG||0)>Number(packingResult.maxPayloadKG)+.001;
  const sequenceMismatch=packingRows.some(r=>!r.reconciled);
  const ready=plannedTotal>0&&shortTotal===0&&!payloadExceeded&&!sequenceMismatch;

  document.getElementById('printReadinessBadge').className=`print-ready-badge ${ready?'ready':'warning'}`;
  document.getElementById('printReadinessBadge').textContent=ready?'READY TO LOAD':'REVIEW REQUIRED';
  document.getElementById('printPlanMeta').innerHTML=`
    <div><span>Plan</span><strong>${escapeHtml(plan.Plan_ID)}</strong></div>
    <div><span>Container</span><strong>${escapeHtml(container?.Container_Name||'')}</strong></div>
    <div><span>Internal Size</span><strong>${formatDimension(container.Internal_Length_mm)} × ${formatDimension(container.Internal_Width_mm)} × ${formatDimension(container.Internal_Height_mm)} ${dimensionLabel()}</strong></div>
    <div><span>Planned Packages</span><strong>${formatNumber(plannedTotal)}</strong></div>
    <div><span>Planned Gross</span><strong>${formatDecimal(weightFromKG(grossKg),2)} ${weightLabel()}</strong></div>
    <div><span>Planned CBM</span><strong>${formatDecimal(cbmTotal,3)} CBM</strong></div>`;
  document.getElementById('printOverallOrientation').innerHTML=`<strong>LOADING DIRECTION</strong><span>BACK</span><div class="print-direction-line"></div><span>DOORS</span><small>Load the deepest cargo first. Complete lower/supporting cargo before upper cargo in the same bay.</small>`;

  document.getElementById('printItems').innerHTML=`
    <div class="print-pack-row print-pack-head"><span>#</span><span>Product / Packing</span><span>Requested</span><span>Planned</span><span>Gross</span><span>Sequence</span><span>Status</span></div>
    ${packingRows.map(r=>`<div class="print-pack-row"><span>${r.index+1}</span><span><strong>${escapeHtml(r.item.Product_Name)}</strong><small>${escapeHtml(r.item.Packing_Type||'—')} · ${formatDimension(r.item.Length_mm)} × ${formatDimension(r.item.Width_mm)} × ${formatDimension(r.item.Height_mm)} ${dimensionLabel()}</small></span><span>${formatNumber(r.requested)}</span><span>${formatNumber(r.planned)}</span><span>${formatDecimal(weightFromKG(r.totalKg),1)} ${weightLabel()}</span><span>${formatNumber(r.sequenced)} ${r.reconciled?'✓':'!'}</span><span class="${r.short||!r.reconciled?'print-status-bad':'print-status-ok'}">${r.short?`SHORT ${formatNumber(r.short)}`:!r.reconciled?'MISMATCH':'READY'}</span></div>`).join('')}
    <div class="print-pack-row print-pack-total"><span></span><span>TOTAL</span><span>${formatNumber(requestedTotal)}</span><span>${formatNumber(plannedTotal)}</span><span>${formatDecimal(weightFromKG(grossKg),1)} ${weightLabel()}</span><span>${formatNumber(printSteps.reduce((n,s)=>n+s.qty,0))}</span><span>${ready?'READY':'CHECK'}</span></div>`;

  document.getElementById('printSummaryChecks').innerHTML=`
    <strong>PRE-LOADING RELEASE CHECK</strong>
    <div>☐ Packing list physically counted / verified</div><div>☐ Container condition checked: dry, clean and suitable</div>
    <div>☐ Payload / weight limits reviewed</div><div>☐ Dunnage, blocking / bracing and securing materials ready</div>
    <div>☐ BACK and DOORS orientation confirmed with loading team</div><div>☐ Any special cargo handling instructions briefed</div>
    ${!ready?`<p class="print-warning"><strong>DO NOT RELEASE AS FINAL:</strong> ${shortTotal?`${formatNumber(shortTotal)} package(s) are short of the requested quantity. `:''}${payloadExceeded?'Payload requires review. ':''}${sequenceMismatch?'Loading sequence does not reconcile with the physical packing plan.':''}</p>`:''}`;

  let priorIndices=new Set();
  document.getElementById('printLoadingSteps').innerHTML=printSteps.map(step=>{
    const topSvg=printStepSvg(step,priorIndices,'top');
    const frontSvg=printStepSvg(step,priorIndices,'front');
    const page=`<section class="print-page print-loading-page">
      <div class="print-step-header"><div><div class="print-brand">FOREGO EXPORTS · WAREHOUSE LOADING INSTRUCTION</div><h2>STEP ${String(step.step).padStart(2,'0')} OF ${String(printSteps.length).padStart(2,'0')} — ${escapeHtml(step.item.Product_Name)}</h2></div><div class="print-step-qty"><span>LOAD NOW</span><strong>${formatNumber(step.qty)} PACKAGES</strong><small>${formatDecimal(weightFromKG(step.kg),1)} ${weightLabel()}</small></div></div>
      <div class="print-step-facts"><div><span>Position</span><strong>${step.zone} · ${step.side}</strong></div><div><span>Distance from Back</span><strong>${step.fromFt.toFixed(1)}–${step.toFt.toFixed(1)} ft</strong></div><div><span>Level</span><strong>${escapeHtml(step.level)}</strong></div><div><span>Orientation</span><strong>${escapeHtml(step.orientation)}</strong></div><div><span>Pattern</span><strong>${escapeHtml(loadingStepPattern(step))}</strong></div><div><span>Packing</span><strong>${escapeHtml(step.item.Packing_Type||'—')}</strong></div></div>
      <div class="print-step-visuals"><div>${topSvg}<p><b>Highlighted:</b> load in this step. <span class="print-context-key">Grey:</span> already-loaded context.</p></div><div>${frontSvg}<p>Use this section view to verify the stack position across the container width.</p></div></div>
      <div class="print-step-note"><strong>LOADING INSTRUCTION</strong><p>${escapeHtml(printStepInstruction(step))}</p></div>
      <div class="print-step-checks"><label>☐ Counted <b>${formatNumber(step.qty)}</b> packages</label><label>☐ Position / orientation verified</label><label>☐ Support / stack stability checked</label><label>☐ Voids / movement controlled</label><label>☐ STEP ${String(step.step).padStart(2,'0')} COMPLETE</label></div>
      <div class="print-step-footer"><span>Actual loaded: ______ packages</span><span>Variance / note: ______________________________________________</span><span>Initial: __________</span></div>
    </section>`;
    (step.indices||[]).forEach(i=>priorIndices.add(i));
    return page;
  }).join('') || '<section class="print-page"><h2>No physical loading steps.</h2></section>';

  document.getElementById('printReconciliation').innerHTML=`<div class="print-reconcile-head"><span>Product</span><span>Packing List</span><span>Loading Steps</span><span>Actual Loaded</span><span>Variance</span><span>Check</span></div>${packingRows.map(r=>`<div class="print-reconcile-row"><strong>${escapeHtml(r.item.Product_Name)}</strong><span>${formatNumber(r.planned)}</span><span>${formatNumber(r.sequenced)}</span><span>________</span><span>________</span><span>${r.reconciled?'✓ MATCH':'⚠ CHECK'}</span></div>`).join('')}<div class="print-reconcile-row total"><strong>TOTAL</strong><span>${formatNumber(plannedTotal)}</span><span>${formatNumber(printSteps.reduce((n,s)=>n+s.qty,0))}</span><span>________</span><span>________</span><span>${sequenceMismatch?'CHECK':'✓ MATCH'}</span></div>`;
  document.getElementById('printFinalChecklist').innerHTML=`<h3>Before Closing Container</h3><div class="print-final-grid"><div>☐ Every loading step completed in sequence</div><div>☐ Actual loaded quantity reconciled product-by-product</div><div>☐ No loose / unstable packages or unsafe voids</div><div>☐ Required blocking, bracing, dunnage / securing completed</div><div>☐ Door-end cargo checked before closing</div><div>☐ Final photos taken and retained with plan</div><div>☐ Container doors close freely without cargo pressure</div><div>☐ Container / seal number recorded after closure</div></div>`;

  setTimeout(()=>{ hideGlobalLoader(); window.print(); },260);
}



/* =========================================================
   LOADERS / FEEDBACK
========================================================= */

function showGlobalLoader(
  title = 'Loading…',
  message = 'Please wait a moment.'
) {
  globalLoaderTitle.textContent =
    title;

  globalLoaderMessage.textContent =
    message;

  globalLoader.classList.remove(
    'hidden'
  );

  document.body.classList.add(
    'is-busy'
  );
}


function hideGlobalLoader() {
  globalLoader.classList.add(
    'hidden'
  );

  document.body.classList.remove(
    'is-busy'
  );
}


function showViewerLoader(
  message = 'Recalculating stuffing…'
) {
  viewerActionLoaderText.textContent =
    message;

  viewerActionLoader.classList.remove(
    'hidden'
  );
}


function hideViewerLoader() {
  viewerActionLoader.classList.add(
    'hidden'
  );
}


function showToast(
  message,
  type = 'success',
  duration = 2200
) {
  if (toastTimer) {
    clearTimeout(
      toastTimer
    );
  }

  appToast.className =
    `app-toast ${type}`;

  appToast.textContent =
    message;

  appToast.classList.remove(
    'hidden'
  );

  toastTimer =
    setTimeout(
      () => {
        appToast.classList.add(
          'hidden'
        );
      },
      duration
    );
}


function setElementBusy(
  element,
  busy,
  busyText = '',
  restoreText = ''
) {
  if (!element) {
    return;
  }

  if (busy) {
    if (
      !element.dataset.originalText
    ) {
      element.dataset.originalText =
        element.textContent;
    }

    element.disabled = true;

    element.classList.add(
      'button-loading'
    );

    if (busyText) {
      element.textContent =
        busyText;
    }

  } else {
    element.disabled = false;

    element.classList.remove(
      'button-loading'
    );

    element.textContent =
      restoreText ||
      element.dataset.originalText ||
      element.textContent;

    delete element.dataset.originalText;
  }
}


async function withGlobalLoader(
  title,
  message,
  fn
) {
  showGlobalLoader(
    title,
    message
  );

  try {
    return await fn();
  } finally {
    hideGlobalLoader();
  }
}


async function withViewerLoader(
  message,
  fn
) {
  showViewerLoader(
    message
  );

  try {
    return await fn();
  } finally {
    hideViewerLoader();
  }
}


async function withButtonLoader(
  element,
  busyText,
  fn
) {
  const originalText =
    element?.textContent || '';

  setElementBusy(
    element,
    true,
    busyText
  );

  try {
    return await fn();
  } finally {
    setElementBusy(
      element,
      false,
      '',
      originalText
    );
  }
}


/* =========================================================
   EVENTS
========================================================= */

function bindEvents() {
  document
    .querySelectorAll(
      '.strategy-option input[type="radio"]'
    )
    .forEach(
      input => {
        input.addEventListener(
          'change',
          () => {
            loadingStrategy[
              input.name
            ] =
              input.value;

            saveStrategyForPlan();

            refreshEverything();

            showToast(
              'Loading strategy updated.'
            );
          }
        );
      }
    );

  document
    .getElementById(
      'resetStrategyBtn'
    )
    ?.addEventListener(
      'click',
      resetLoadingStrategy
    );

  mobileForm.addEventListener(
    'submit',
    event => {
      event.preventDefault();
      requestOtp();
    }
  );

  otpForm.addEventListener(
    'submit',
    event => {
      event.preventDefault();
      verifyOtp();
    }
  );

  document
    .getElementById(
      'changeMobileBtn'
    )
    .addEventListener(
      'click',
      () => {
        otpForm.classList.add(
          'hidden'
        );

        mobileForm.classList.remove(
          'hidden'
        );

        authMessage.textContent = '';

        devOtpHint.classList.add(
          'hidden'
        );

        mobileInput.focus();
      }
    );

  document
    .getElementById('logoutBtn')
    .addEventListener(
      'click',
      logout
    );

  document
    .getElementById('myPlansBtn')
    .addEventListener(
      'click',
      async () => {
        await withGlobalLoader(
          'Loading your plans…',
          'Refreshing saved loading plans.',
          async () => {
            await loadPlans();
            showPlansView();
          }
        );
      }
    );

  document
    .getElementById('newPlanFromListBtn')
    .addEventListener(
      'click',
      createNewPlan
    );

  document
    .getElementById('newPlanTopBtn')
    .addEventListener(
      'click',
      async () => {
        if (
          confirm(
            'Start a new loading plan?'
          )
        ) {
          await createNewPlan();
        }
      }
    );

  document
    .getElementById('addCargoBtn')
    .addEventListener(
      'click',
      openNewCargoModal
    );

  document
    .getElementById('closeCargoBtn')
    .addEventListener(
      'click',
      closeCargoModal
    );

  document
    .getElementById('cancelCargoBtn')
    .addEventListener(
      'click',
      closeCargoModal
    );

  cargoForm.addEventListener(
    'submit',
    saveCargo
  );

  containerSelect.addEventListener(
    'change',
    async () => {
      await withViewerLoader(
        'Changing container…',
        async () => {
          await savePlanSettings();
          refreshEverything();
          await loadPlans();
        }
      );
    }
  );

  dimensionUnit.addEventListener(
    'change',
    async () => {
      await withViewerLoader(
        'Changing display units…',
        async () => {
          await savePlanSettings();
          updateCargoLabels();
          refreshEverything();
        }
      );
    }
  );

  weightUnit.addEventListener(
    'change',
    async () => {
      await withViewerLoader(
        'Changing weight units…',
        async () => {
          await savePlanSettings();
          updateCargoLabels();
          refreshEverything();
        }
      );
    }
  );

  document
    .getElementById(
      'shellModeBtn'
    )
    .addEventListener(
      'click',
      event => {
        manualGridVisible =
          !manualGridVisible;

        event.currentTarget
          .classList.toggle(
            'active-tool',
            manualGridVisible
          );

        render3D(
          packingResult
        );
      }
    );

  document
    .getElementById(
      'dimensionToggleBtn'
    )
    .addEventListener(
      'click',
      event => {
        showSceneDimensions =
          !showSceneDimensions;

        event.currentTarget
          .classList.toggle(
            'active-tool',
            showSceneDimensions
          );

        render3D(
          packingResult
        );
      }
    );

  document
    .getElementById(
      'occupancyToggleBtn'
    )
    .addEventListener(
      'click',
      event => {
        showOccupancyMarkers =
          !showOccupancyMarkers;

        event.currentTarget
          .classList.toggle(
            'active-tool',
            showOccupancyMarkers
          );

        render3D(
          packingResult
        );
      }
    );

  document
    .getElementById('rotateViewBtn')
    .addEventListener(
      'click',
      event => {
        autoRotate =
          !autoRotate;

        event.currentTarget
          .textContent =
            autoRotate
              ? 'Stop Rotation'
              : 'Auto Rotate';
      }
    );

  document
    .getElementById('resetViewBtn')
    .addEventListener(
      'click',
      resetCamera
    );

  document
    .querySelectorAll(
      '.view-tab'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        () =>
          applyView(
            button.dataset.view
          )
      );
    });

  let stuffingWorkspaceSnapshot = null;
  const setPlannerWorkspaceMode = mode => {
    const loading = mode === 'loading';

    if (loading && !plannerView?.classList.contains('packing-loading-mode')) {
      stuffingWorkspaceSnapshot = {
        currentView,
        highlightedItemId,
        manualSelectedItemId,
        manualGridVisible,
        expandedCargoItemId
      };
    }

    if (!loading) {
      // Loading-step highlighting belongs only to the warehouse workspace.
      selectedLoadingStepId = '';
      selectedLoadingPlacementIndices = new Set();
      if (stuffingWorkspaceSnapshot) {
        currentView = stuffingWorkspaceSnapshot.currentView || currentView;
        highlightedItemId = stuffingWorkspaceSnapshot.highlightedItemId || '';
        manualSelectedItemId = stuffingWorkspaceSnapshot.manualSelectedItemId || '';
        manualGridVisible = Boolean(stuffingWorkspaceSnapshot.manualGridVisible);
        expandedCargoItemId = stuffingWorkspaceSnapshot.expandedCargoItemId || expandedCargoItemId;
      }
    }

    plannerView?.classList.toggle('packing-loading-mode', loading);
    plannerView?.classList.toggle('stuffing-plan-mode', !loading);
    document.getElementById('stuffingModeBtn')?.classList.toggle('active', !loading);
    document.getElementById('loadingModeBtn')?.classList.toggle('active', loading);
    document.getElementById('stuffingModeBtn')?.setAttribute('aria-pressed', String(!loading));
    document.getElementById('loadingModeBtn')?.setAttribute('aria-pressed', String(loading));

    if (!loading) renderCargoList();
    try { sessionStorage.setItem('foregoPlannerWorkspaceMode', loading ? 'loading' : 'stuffing'); } catch (_) {}
    requestAnimationFrame(() => requestAnimationFrame(() => {
      resizeRendererToViewer?.();
      if (!loading && currentView) applyView(currentView);
      else render3D(packingResult);
    }));
  };
  document.getElementById('stuffingModeBtn')?.addEventListener('click',()=>setPlannerWorkspaceMode('stuffing'));
  document.getElementById('loadingModeBtn')?.addEventListener('click',()=>setPlannerWorkspaceMode('loading'));
  try { setPlannerWorkspaceMode(sessionStorage.getItem('foregoPlannerWorkspaceMode') === 'loading' ? 'loading' : 'stuffing'); } catch (_) { setPlannerWorkspaceMode('stuffing'); }

  document.getElementById('showPackingListBtn')?.addEventListener('click',()=>{document.getElementById('showPackingListBtn')?.classList.add('active');document.getElementById('showLoadingListBtn')?.classList.remove('active');packingListPanel?.classList.remove('hidden');loadingListPanel?.classList.add('hidden');});
  document.getElementById('showLoadingListBtn')?.addEventListener('click',()=>{document.getElementById('showLoadingListBtn')?.classList.add('active');document.getElementById('showPackingListBtn')?.classList.remove('active');loadingListPanel?.classList.remove('hidden');packingListPanel?.classList.add('hidden');const next=loadingStepCache.find(step=>!loadingProgressDone.has(step.id))||loadingStepCache[loadingStepCache.length-1];if(next)selectLoadingStep(next.id);});
  loadingStepsEl?.addEventListener('click',event=>{const check=event.target.closest('.loading-step-check');if(check){event.stopPropagation();const id=check.dataset.stepId;const stepIndex=loadingStepCache.findIndex(step=>step.id===id);if(check.checked){const firstIncomplete=loadingStepCache.findIndex((step,index)=>index<stepIndex&&!loadingProgressDone.has(step.id));if(firstIncomplete>=0){check.checked=false;showToast(`Complete Step ${String(firstIncomplete+1).padStart(2,'0')} first.`,'error',2600);selectLoadingStep(loadingStepCache[firstIncomplete].id);return;}loadingProgressDone.add(id);const next=loadingStepCache.slice(stepIndex+1).find(step=>!loadingProgressDone.has(step.id));if(next){selectedLoadingStepId=next.id;selectedLoadingPlacementIndices=new Set(next.indices||[]);}}else{loadingProgressDone.delete(id);selectedLoadingStepId=id;const step=loadingStepCache[stepIndex];selectedLoadingPlacementIndices=new Set(step?.indices||[]);}saveLoadingProgress();renderPackingAndLoadingLists(packingResult);render3D(packingResult);return;}const row=event.target.closest('.loading-step');if(row)selectLoadingStep(row.dataset.stepId);});
  loadingStepsEl?.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;const row=event.target.closest('.loading-step');if(!row)return;event.preventDefault();selectLoadingStep(row.dataset.stepId);});
  document.getElementById('resetLoadingProgressBtn')?.addEventListener('click',()=>{if(!loadingProgressDone.size||confirm('Reset all loading progress for this plan?')){loadingProgressDone.clear();selectedLoadingStepId='';selectedLoadingPlacementIndices=new Set();saveLoadingProgress();renderPackingAndLoadingLists(packingResult);render3D(packingResult);}});
  document.getElementById('printLoadingSheetBtn')?.addEventListener('click',preparePrint);

  document
    .getElementById('downloadBtn')
    .addEventListener(
      'click',
      preparePrint
    );

  document
    .getElementById('printBtn')
    .addEventListener(
      'click',
      preparePrint
    );
}


/* =========================================================
   UNITS
========================================================= */

function dimensionToMM(value) {
  return Number(
    (
      Number(
        value || 0
      ) *
      DIMENSION_UNITS[
        dimensionUnit.value
      ].toMM
    ).toFixed(3)
  );
}


function dimensionFromMM(value) {
  return Number(
    (
      Number(
        value || 0
      ) /
      DIMENSION_UNITS[
        dimensionUnit.value
      ].toMM
    ).toFixed(3)
  );
}


function weightToKG(value) {
  return Number(
    (
      Number(
        value || 0
      ) *
      WEIGHT_UNITS[
        weightUnit.value
      ].toKG
    ).toFixed(4)
  );
}


function weightFromKG(value) {
  return Number(
    (
      Number(
        value || 0
      ) /
      WEIGHT_UNITS[
        weightUnit.value
      ].toKG
    ).toFixed(3)
  );
}


function dimensionLabel() {
  return DIMENSION_UNITS[
    dimensionUnit.value
  ].label;
}


function weightLabel() {
  return WEIGHT_UNITS[
    weightUnit.value
  ].label;
}


function formatDimension(mm) {
  const converted =
    dimensionFromMM(mm);

  const unit =
    dimensionUnit.value;

  const decimals =
    unit === 'in' ||
    unit === 'ft'
      ? 2
      : unit === 'cm'
        ? 1
        : 0;

  return formatDecimal(
    converted,
    decimals
  );
}


function updateCargoLabels() {
  const d =
    dimensionLabel();

  const w =
    weightLabel();

  document
    .getElementById('lengthLabel')
    .textContent =
      `Length (${d})`;

  document
    .getElementById('widthLabel')
    .textContent =
      `Width (${d})`;

  document
    .getElementById('heightLabel')
    .textContent =
      `Height (${d})`;

  document
    .getElementById('weightLabel')
    .textContent =
      `Gross Weight / Package (${w})`;
}


/* =========================================================
   HELPERS
========================================================= */

function selectedContainer() {
  return containers.find(
    container =>
      container.Container_ID ===
      containerSelect.value
  );
}


function assignUniqueDisplayColours() {
  const used =
    new Set();

  items.forEach(
    (
      item,
      index
    ) => {
      let preferred =
        String(
          item.Colour ||
          ''
        ).trim();

      if (
        !preferred ||
        used.has(
          preferred.toUpperCase()
        )
      ) {
        preferred =
          COLOURS.find(
            colour =>
              !used.has(
                colour.toUpperCase()
              )
          ) ||
          COLOURS[
            index %
            COLOURS.length
          ];
      }

      item._DisplayColour =
        preferred;

      used.add(
        preferred.toUpperCase()
      );
    }
  );
}


function displayColour(
  item
) {
  return (
    item?._DisplayColour ||
    item?.Colour ||
    '#64748B'
  );
}


function chooseColour() {
  assignUniqueDisplayColours();

  const used =
    new Set(
      items.map(
        item =>
          String(
            displayColour(
              item
            )
          ).toUpperCase()
      )
    );

  return (
    COLOURS.find(
      colour =>
        !used.has(
          colour.toUpperCase()
        )
    ) ||
    COLOURS[
      items.length %
      COLOURS.length
    ]
  );
}


function toBoolean(value) {
  return (
    value === true ||
    String(value)
      .toUpperCase() ===
      'TRUE' ||
    String(value) === '1'
  );
}


function setValue(id, value) {
  document
    .getElementById(id)
    .value =
      value ?? '';
}


function getWeightPriorityLabel(
  item
) {
  if (!items.length) {
    return '';
  }

  const weights =
    items
      .map(
        cargo =>
          Number(
            cargo.Gross_Weight_Kg || 0
          )
      )
      .sort(
        (a, b) =>
          a - b
      );

  const min =
    weights[0];

  const max =
    weights[
      weights.length - 1
    ];

  const current =
    Number(
      item.Gross_Weight_Kg || 0
    );

  if (
    Math.abs(
      max - min
    ) <
    0.001
  ) {
    return 'Same weight';
  }

  const ratio =
    (
      current - min
    ) /
    (
      max - min
    );

  if (
    ratio >=
    0.67
  ) {
    return 'Heavy · lower';
  }

  if (
    ratio <=
    0.33
  ) {
    return 'Light · upper';
  }

  return 'Medium';
}


function formatShortDate(value) {
  if (!value) {
    return '—';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '—';
  }

  return date
    .toLocaleDateString(
      'en-IN',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }
    );
}


function formatShortDateTime(value) {
  if (!value) {
    return '—';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '—';
  }

  return date
    .toLocaleString(
      'en-IN',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }
    );
}


function setAutosaveState(state) {
  const el =
    document.getElementById(
      'autosaveTop'
    );

  if (state === 'saving') {
    el.textContent =
      'Saving...';

    el.style.color =
      '#f5d77a';
  } else if (
    state === 'error'
  ) {
    el.textContent =
      'Save Failed';

    el.style.color =
      '#ff8f8f';
  } else {
    el.textContent =
      '✓ Auto-Saved';

    el.style.color =
      '#4ee283';
  }
}


function setButtonBusy(
  id,
  busy,
  label
) {
  const button =
    document.getElementById(id);

  button.disabled =
    busy;

  button.textContent =
    label;
}


function clamp(
  value,
  min,
  max
) {
  return Math.min(
    max,
    Math.max(
      min,
      Number(
        value || 0
      )
    )
  );
}


function formatNumber(value) {
  return Number(
    value || 0
  ).toLocaleString(
    'en-IN'
  );
}


function formatDecimal(
  value,
  digits
) {
  return Number(
    value || 0
  ).toLocaleString(
    'en-IN',
    {
      minimumFractionDigits:
        digits,
      maximumFractionDigits:
        digits
    }
  );
}


function escapeHtml(value) {
  return String(
    value ?? ''
  )
    .replace(
      /&/g,
      '&amp;'
    )
    .replace(
      /</g,
      '&lt;'
    )
    .replace(
      />/g,
      '&gt;'
    )
    .replace(
      /"/g,
      '&quot;'
    )
    .replace(
      /'/g,
      '&#039;'
    );
}


start();
