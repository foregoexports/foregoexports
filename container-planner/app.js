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
  '#29A8B8',
  '#D5A62E',
  '#64748B',
  '#C153A3',
  '#5E9B55'
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
          openPlan(
            savedPlan.Plan_ID
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

  const container =
    containers[0];

  if (!container) {
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
}


async function openPlan(planId) {
  const data =
    await apiGet(
      'getPlan',
      {
        planId,
        sessionToken
      }
    );

  if (!data.ok) {
    alert(
      data.message ||
      'Unable to open plan.'
    );

    return;
  }

  plan = data.plan;
  items = data.items || [];

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
}


/* =========================================================
   SAVE PLAN SETTINGS
========================================================= */

async function savePlanSettings() {
  if (!plan) {
    return;
  }

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
  }
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

  setAutosaveState('saving');

  const result =
    await apiPost(payload);

  if (!result.ok) {
    setAutosaveState('error');

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

  const payload = {
    action: 'updateItem',
    sessionToken,
    Item_ID: itemId
  };

  if (mode === 'default') {
    payload.Rotate_Horizontal =
      false;

    payload.Turn_Sideways =
      false;

    payload.Turn_Upside_Down =
      false;
  }

  if (mode === 'rotate') {
    payload.Rotate_Horizontal =
      true;
  }

  if (mode === 'sideways') {
    payload.Turn_Sideways =
      !toBoolean(
        item.Turn_Sideways
      );
  }

  if (mode === 'upside') {
    payload.Turn_Upside_Down =
      !toBoolean(
        item.Turn_Upside_Down
      );
  }

  setAutosaveState('saving');

  const result =
    await apiPost(payload);

  if (!result.ok) {
    setAutosaveState('error');
    alert(result.message);
    return;
  }

  await reloadPlan();
  await loadPlans();

  setAutosaveState('saved');
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

  setAutosaveState('saving');

  const result =
    await apiPost({
      action: 'deleteItem',
      Item_ID: itemId,
      sessionToken
    });

  if (!result.ok) {
    setAutosaveState('error');
    alert(result.message);
    return;
  }

  await reloadPlan();
  await loadPlans();

  setAutosaveState('saved');
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
  renderCargoList();

  const totals =
    calculateTotals();

  packingResult =
    calculatePacking();

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

    const rotateActive =
      toBoolean(
        item.Rotate_Horizontal
      );

    const sideActive =
      toBoolean(
        item.Turn_Sideways
      );

    const upsideActive =
      toBoolean(
        item.Turn_Upside_Down
      );

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
              item.Colour
            )}
          "
        ></span>

        <div class="cargo-name">
          ${escapeHtml(
            item.Product_Name
          )}
        </div>

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

        Internal:
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

      <div class="orientation-row">
        <button
          class="orientation-btn default-btn"
          type="button"
        >
          Default
        </button>

        <button
          class="orientation-btn rotate-btn ${rotateActive ? 'active' : ''}"
          type="button"
        >
          Rotate Floor
        </button>

        <button
          class="orientation-btn sideways-btn ${sideActive ? 'active' : ''}"
          type="button"
        >
          Rotate Sideways
        </button>

        <button
          class="orientation-btn upside-btn ${upsideActive ? 'active' : ''}"
          type="button"
        >
          Upside Down
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
      .querySelector('.upside-btn')
      .addEventListener(
        'click',
        () =>
          setOrientation(
            item.Item_ID,
            'upside'
          )
      );

    cargoList.appendChild(card);
  });
}


/* =========================================================
   TOTALS
========================================================= */

function calculateTotals() {
  let packages = 0;
  let weightKG = 0;
  let cbm = 0;

  items.forEach(item => {
    const qty =
      Number(
        item.Quantity || 0
      );

    packages += qty;

    weightKG +=
      Number(
        item.Gross_Weight_Kg ||
        0
      ) *
      qty;

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
        qty
      ) /
      1000000000;
  });

  const container =
    selectedContainer();

  let containerCBM = 0;
  let volumePct = 0;
  let payloadPct = 0;

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
      Number(
        container.Max_Payload_Kg
      )
        ? weightKG /
          Number(
            container.Max_Payload_Kg
          ) *
          100
        : 0;
  }

  document
    .getElementById('totalPackages')
    .textContent =
      formatNumber(packages);

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
        volumePct,
        1
      )}%`;

  document
    .getElementById('payloadUsed')
    .textContent =
      `${formatDecimal(
        payloadPct,
        1
      )}%`;

  saveTotals(
    packages,
    weightKG,
    cbm,
    volumePct,
    payloadPct
  );

  return {
    packages,
    weightKG,
    cbm,
    containerCBM,
    volumePct,
    payloadPct,
    maxPayloadKG:
      Number(
        container?.Max_Payload_Kg ||
        0
      )
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
      results: []
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

  let cursorX = 0;

  const placements = [];
  const results = [];

  const sortedItems =
    [...items]
      .sort(
        (a, b) =>
          Number(
            a.Loading_Order || 0
          ) -
          Number(
            b.Loading_Order || 0
          )
      );

  sortedItems.forEach(item => {
    const requested =
      Number(
        item.Quantity || 0
      );

    const remainingLength =
      Math.max(
        0,
        C.L - cursorX
      );

    const orientations =
      allowedOrientations(
        item
      );

    let best = null;

    orientations.forEach(o => {
      if (
        o.l <= 0 ||
        o.w <= 0 ||
        o.h <= 0
      ) {
        return;
      }

      const across =
        Math.floor(
          C.W / o.w
        );

      let layers =
        toBoolean(
          item.Stackable
        )
          ? Math.floor(
              C.H / o.h
            )
          : 1;

      const maxLayers =
        Number(
          item.Max_Layers || 0
        );

      if (maxLayers > 0) {
        layers =
          Math.min(
            layers,
            maxLayers
          );
      }

      const rows =
        Math.floor(
          remainingLength /
          o.l
        );

      const capacity =
        Math.max(
          0,
          across *
          layers *
          rows
        );

      const fit =
        Math.min(
          requested,
          capacity
        );

      const rowsNeeded =
        fit > 0
          ? Math.ceil(
              fit /
              Math.max(
                1,
                across *
                layers
              )
            )
          : 0;

      const usedLength =
        rowsNeeded *
        o.l;

      const score =
        fit * 1000000 -
        usedLength;

      if (
        !best ||
        score >
        best.score
      ) {
        best = {
          ...o,
          across,
          layers,
          rows,
          capacity,
          fit,
          rowsNeeded,
          usedLength,
          score
        };
      }
    });

    if (!best) {
      best = {
        l: 0,
        w: 0,
        h: 0,
        across: 0,
        layers: 0,
        fit: 0,
        rowsNeeded: 0,
        usedLength: 0
      };
    }

    let placed = 0;

    for (
      let r = 0;
      r < best.rowsNeeded;
      r++
    ) {
      for (
        let layer = 0;
        layer < best.layers;
        layer++
      ) {
        for (
          let across = 0;
          across < best.across;
          across++
        ) {
          if (
            placed >=
            best.fit
          ) {
            break;
          }

          placements.push({
            itemId:
              item.Item_ID,
            colour:
              item.Colour,
            x:
              cursorX +
              r * best.l,
            y:
              across *
              best.w,
            z:
              layer *
              best.h,
            l:
              best.l,
            w:
              best.w,
            h:
              best.h
          });

          placed++;
        }
      }
    }

    cursorX +=
      best.usedLength;

    results.push({
      item,
      requested,
      fitted:
        best.fit,
      remaining:
        Math.max(
          0,
          requested -
          best.fit
        ),
      orientation:
        best
    });
  });

  return {
    placements,
    results,
    usedLength:
      cursorX
  };
}


function allowedOrientations(item) {
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

  const values = [
    [L, W, H]
  ];

  if (
    toBoolean(
      item.Rotate_Horizontal
    )
  ) {
    values.push([
      W,
      L,
      H
    ]);
  }

  if (
    toBoolean(
      item.Turn_Sideways
    )
  ) {
    values.push(
      [L, H, W],
      [H, L, W],
      [W, H, L],
      [H, W, L]
    );
  }

  /*
    Upside-down does not change the bounding box size,
    but we retain the flag for handling/printing logic.
  */

  const unique =
    new Map();

  values.forEach(
    ([l, w, h]) => {
      unique.set(
        `${l}-${w}-${h}`,
        {
          l,
          w,
          h
        }
      );
    }
  );

  return [
    ...unique.values()
  ];
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

        return `
        <div class="fit-row">

          <div class="fit-name">
            <span
              class="colour-dot"
              style="
                background:
                ${escapeHtml(
                  row.item.Colour
                )}
              "
            ></span>

            ${escapeHtml(
              row.item.Product_Name
            )}
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
                ? `<span class="status-warning">${formatNumber(row.remaining)} left</span>`
                : `<span class="status-ok">OK</span>`
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
    () =>
      window.print(),
    150
  );
}


/* =========================================================
   EVENTS
========================================================= */

function bindEvents() {
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
        await loadPlans();
        showPlansView();
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
      await savePlanSettings();
      refreshEverything();
      await loadPlans();
    }
  );

  dimensionUnit.addEventListener(
    'change',
    async () => {
      await savePlanSettings();
      updateCargoLabels();
      refreshEverything();
    }
  );

  weightUnit.addEventListener(
    'change',
    async () => {
      await savePlanSettings();
      updateCargoLabels();
      refreshEverything();
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


function chooseColour() {
  const used =
    items.map(
      item =>
        item.Colour
    );

  return (
    COLOURS.find(
      colour =>
        !used.includes(
          colour
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
