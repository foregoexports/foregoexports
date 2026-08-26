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
   REFRESH UI
========================================================= */

function refreshEverything() {
  ensureStrategySequence();
  assignUniqueDisplayColours();
  renderStrategyControls();
  renderCustomSequence();

  /*
    First calculate one shared physical packing result.
    Dashboard totals are derived only from cartons actually placed.
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

  renderContainerDimensions(
    totals
  );

  renderUtilisation(
    totals
  );

  render3D(
    packingResult
  );

  renderCapacityGuard(
    packingResult,
    totals
  );
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
   CARGO LIST
========================================================= */

function renderCargoList() {
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
      `;

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

    cargoList.appendChild(
      card
    );
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

  /*
    MIXED-ORIENTATION OPTIMISER
    ---------------------------
    Instead of choosing one orientation for an entire product,
    the container is represented as a list of remaining free
    rectangular spaces.

    For every carton we:
      1. Test every orientation currently allowed for that product.
      2. Test it against every free space.
      3. Pick the placement with the strongest fit score.
      4. Split that free space into three non-overlapping spaces.
      5. Repeat until all requested cartons are placed or no fit remains.

    This means one product can be packed as, for example:
      - 2 rows lengthwise
      - 1 row floor-rotated
      - a few cartons sideways in the remaining gap

    Auto Best Fit allows all six box orientations and can mix them.
  */

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
      selectedContainer()
        ?.Max_Payload_Kg ||
      0
    );

  let loadedPayloadKG =
    0;

  const sortedItems =
    getStrategySortedItems();

  sortedItems.forEach(item => {
    const requested =
      Number(
        item.Quantity || 0
      );

    const orientations =
      allowedOrientations(
        item
      );

    let fitted = 0;

    const packageWeightKG =
      Math.max(
        0,
        Number(
          item.Gross_Weight_Kg ||
          0
        )
      );

    let stopReason =
      '';

    const breakdownMap =
      new Map();

    /*
      A safety cap prevents a malformed input from locking the browser.
      Normal export plans will be far below this.
    */
    const maxIterations =
      Math.min(
        requested,
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

      const candidate =
        findBestMixedPlacement(
          freeSpaces,
          orientations,
          item,
          C
        );

      if (!candidate) {
        stopReason =
          'space';

        break;
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
          candidate.orientation.type
      };

      placements.push(
        placement
      );

      fitted++;

      loadedPayloadKG +=
        packageWeightKG;

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

            dimensions:
              {
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

      /*
        Keep the free-space list ordered so the optimiser fills
        nearer the loading end / floor first and produces a
        practical, readable stuffing layout.
      */
      freeSpaces.sort(
        freeSpacePrioritySort
      );
    }

    const remaining =
      Math.max(
        0,
        requested -
        fitted
      );

    const breakdown =
      [...breakdownMap.values()]
        .sort(
          (a, b) =>
            b.count -
            a.count
        );

    results.push({
      item,
      requested,
      fitted,
      remaining,
      breakdown,
      mixed:
        breakdown.length > 1,

      stopReason,

      loadedWeightKG:
        fitted *
        packageWeightKG,

      packageWeightKG,

      orientation:
        breakdown.length
          ? {
              ...breakdown[0].dimensions,
              type:
                breakdown[0].type,
              label:
                breakdown[0].label
            }
          : null
    });
  });

  return {
    placements,
    results,
    freeSpaces,
    loadedPayloadKG,
    maxPayloadKG
  };
}


function findBestMixedPlacement(
  freeSpaces,
  orientations,
  item,
  container
) {
  let best = null;

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
          container
        )
      ) {
        continue;
      }

      const score =
        mixedPlacementScore(
          orientation,
          space,
          item,
          container
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


function orientationFitsSpace(
  orientation,
  space,
  item,
  container
) {
  const EPS =
    0.001;

  if (
    orientation.l <= 0 ||
    orientation.w <= 0 ||
    orientation.h <= 0
  ) {
    return false;
  }

  if (
    orientation.l >
      space.l + EPS ||
    orientation.w >
      space.w + EPS ||
    orientation.h >
      space.h + EPS
  ) {
    return false;
  }

  /*
    Non-stackable cargo is restricted to the floor.
  */
  if (
    !toBoolean(
      item.Stackable
    ) &&
    space.z >
      EPS
  ) {
    return false;
  }

  /*
    Respect Max_Layers approximately even when mixed orientations
    are enabled. A carton placed at z must not exceed the selected
    orientation's permitted stack height.
  */
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

  /*
    Final guard against any floating-point overflow.
  */
  if (
    space.x +
    orientation.l >
    container.L +
    EPS
  ) {
    return false;
  }

  if (
    space.y +
    orientation.w >
    container.W +
    EPS
  ) {
    return false;
  }

  if (
    space.z +
    orientation.h >
    container.H +
    EPS
  ) {
    return false;
  }

  return true;
}


function mixedPlacementScore(
  orientation,
  space,
  item,
  container
) {
  /*
    Lower score is better.

    Priority:
      1. Fill the container from the door/end inward.
      2. Keep cartons on the floor before building higher.
      3. Minimise wasted width / height around the carton.
      4. Prefer orientations that can tile the selected free space
         with more cartons.
      5. Use less leftover volume in the chosen free-space block.

    The score is lexicographic, not a single weighted number,
    which makes the behaviour more stable and predictable.
  */

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

  const spaceVolume =
    space.l *
    space.w *
    space.h;

  const boxVolume =
    orientation.l *
    orientation.w *
    orientation.h;

  const leftoverVolume =
    spaceVolume -
    boxVolume;

  const longitudinalScore =
    strategyLongitudinalScore(
      space,
      orientation,
      container
    );

  const lateralScore =
    strategyLateralScore(
      space,
      orientation,
      container
    );

  return [
    /*
      Weight and stability always prefer the lowest available
      free-space first unless the user explicitly selected
      custom sequence instead of weight-based ordering.
    */
    strategyVerticalScore(
      space
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
    ),

    roundScore(
      leftoverVolume
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

  /*
    Global Auto Mix can temporarily allow all six orientations
    without changing the saved per-product orientation flags.
  */
  if (
    loadingStrategy.orientationMode ===
    'auto-mix'
  ) {
    const all = [
      { l: L, w: W, h: H, type: 'default' },
      { l: W, w: L, h: H, type: 'floor' },
      { l: L, w: H, h: W, type: 'side' },
      { l: H, w: L, h: W, type: 'side' },
      { l: W, w: H, h: L, type: 'side' },
      { l: H, w: W, h: L, type: 'side' }
    ];

    const uniqueAll =
      new Map();

    all.forEach(
      orientation => {
        const key =
          `${orientation.l}-${orientation.w}-${orientation.h}`;

        if (
          !uniqueAll.has(
            key
          )
        ) {
          uniqueAll.set(
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
      ...uniqueAll.values()
    ];
  }

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
                ? `<span class="status-warning">${formatNumber(row.remaining)} left · ${row.stopReason === 'payload' ? 'Payload limit' : 'Space limit'}</span>`
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
      preserveDrawingBuffer: true
    });

  renderer.setPixelRatio(
    Math.min(
      window.devicePixelRatio,
      2
    )
  );

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type =
    THREE.PCFSoftShadowMap;

  viewer.appendChild(
    renderer.domElement
  );

  viewerLoading.classList.add(
    'hidden'
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

  keyLight.castShadow = true;

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


function render3D(result) {
  if (!renderer) {
    return;
  }

  clearGroup(
    cargoGroup
  );

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
    10 / L;

  const scaledL =
    L * scale;

  const scaledW =
    W * scale;

  const scaledH =
    H * scale;


  /* GROUND GRID */

  const grid =
    new THREE.GridHelper(
      16,
      32,
      0xd4dbe5,
      0xe7ebf1
    );

  grid.position.set(
    scaledL / 2,
    -0.04,
    scaledW / 2
  );

  cargoGroup.add(grid);


  /* CONTAINER FLOOR */

  const floor =
    new THREE.Mesh(
      new THREE.BoxGeometry(
        scaledL,
        0.04,
        scaledW
      ),

      new THREE.MeshStandardMaterial({
        color: 0xd8dee7,
        roughness: 0.82,
        metalness: 0.08
      })
    );

  floor.position.set(
    scaledL / 2,
    -0.025,
    scaledW / 2
  );

  floor.receiveShadow = true;

  cargoGroup.add(floor);


  /* TRANSPARENT CONTAINER SHELL */

  const containerGeometry =
    new THREE.BoxGeometry(
      scaledL,
      scaledH,
      scaledW
    );

  const transparentShell =
    new THREE.Mesh(
      containerGeometry,

      new THREE.MeshPhysicalMaterial({
        color: 0xd9e2ee,
        transparent: true,
        opacity: 0.055,
        roughness: 0.35,
        metalness: 0.05,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );

  transparentShell.position.set(
    scaledL / 2,
    scaledH / 2,
    scaledW / 2
  );

  cargoGroup.add(
    transparentShell
  );


  /* CONTAINER EDGE FRAME */

  const edges =
    new THREE.LineSegments(
      new THREE.EdgesGeometry(
        containerGeometry
      ),

      new THREE.LineBasicMaterial({
        color: 0x4f5c6d,
        transparent: true,
        opacity: 0.9
      })
    );

  edges.position.copy(
    transparentShell.position
  );

  cargoGroup.add(edges);


  /* DOOR FRAME */

  const doorFrame =
    new THREE.LineSegments(
      new THREE.EdgesGeometry(
        new THREE.BoxGeometry(
          0.035,
          scaledH,
          scaledW
        )
      ),

      new THREE.LineBasicMaterial({
        color: 0x344152
      })
    );

  doorFrame.position.set(
    0,
    scaledH / 2,
    scaledW / 2
  );

  cargoGroup.add(
    doorFrame
  );


  /* BOXES */

  result.placements.forEach(
    placement => {
      const geometry =
        new THREE.BoxGeometry(
          placement.l *
          scale *
          0.97,

          placement.h *
          scale *
          0.97,

          placement.w *
          scale *
          0.97
        );

      const material =
        new THREE.MeshStandardMaterial({
          color:
            placement.colour ||
            '#64748B',

          roughness:
            0.52,

          metalness:
            0.02
        });

      const mesh =
        new THREE.Mesh(
          geometry,
          material
        );

      mesh.position.set(
        (
          placement.x +
          placement.l / 2
        ) *
        scale,

        (
          placement.z +
          placement.h / 2
        ) *
        scale,

        (
          placement.y +
          placement.w / 2
        ) *
        scale
      );

      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const outline =
        new THREE.LineSegments(
          new THREE.EdgesGeometry(
            geometry
          ),

          new THREE.LineBasicMaterial({
            color: 0x26313f,
            transparent: true,
            opacity: 0.38
          })
        );

      mesh.add(outline);

      cargoGroup.add(mesh);
    }
  );

  applyView(
    currentView
  );
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
      ? 390
      : 500;

  renderer.setSize(
    width,
    height,
    false
  );

  camera.aspect =
    width / height;

  camera
    .updateProjectionMatrix();
}


function animate() {
  requestAnimationFrame(
    animate
  );

  if (controls) {
    controls.autoRotate =
      autoRotate &&
      currentView ===
      '3d';

    controls.update();
  }

  renderer?.render(
    scene,
    camera
  );
}


/* =========================================================
   LEGEND
========================================================= */

function renderLegend() {
  legend.innerHTML =
    items
      .map(item => `
        <div class="legend-item">
          <span
            class="legend-colour"
            style="
              background:
              ${escapeHtml(
                item.Colour
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
        </div>
      `)
      .join('');
}


/* =========================================================
   PRINT
========================================================= */

function preparePrint() {
  if (
    !plan ||
    !items.length
  ) {
    alert(
      'Add at least one cargo item before printing.'
    );

    return;
  }

  showGlobalLoader(
    'Preparing loading plan…',
    'Capturing the 3D view and print reference.'
  );

  const image =
    document.getElementById(
      'print3dImage'
    );

  image.src =
    renderer
      .domElement
      .toDataURL(
        'image/png'
      );

  const container =
    selectedContainer();

  document
    .getElementById(
      'printPlanMeta'
    )
    .innerHTML =
      `
      <p>
        <strong>Plan:</strong>
        ${escapeHtml(
          plan.Plan_ID
        )}
      </p>

      <p>
        <strong>Container:</strong>
        ${escapeHtml(
          container?.Container_Name ||
          ''
        )}
      </p>

      <p>
        <strong>Internal Size:</strong>
        ${formatDimension(
          container.Internal_Length_mm
        )}
        ×
        ${formatDimension(
          container.Internal_Width_mm
        )}
        ×
        ${formatDimension(
          container.Internal_Height_mm
        )}
        ${dimensionLabel()}
      </p>

      <p>
        <strong>Total Packages:</strong>
        ${
          items.reduce(
            (
              total,
              item
            ) =>
              total +
              Number(
                item.Quantity ||
                0
              ),
            0
          )
        }
      </p>
      `;

  document
    .getElementById(
      'printItems'
    )
    .innerHTML =
      items
        .map(item => `
          <div class="print-item">
            <span>
              ${escapeHtml(
                item.Product_Name
              )}
            </span>

            <strong>
              ${formatNumber(
                item.Quantity
              )}
            </strong>
          </div>
        `)
        .join('');

  setTimeout(
    () => {
      hideGlobalLoader();
      window.print();
    },
    220
  );
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
