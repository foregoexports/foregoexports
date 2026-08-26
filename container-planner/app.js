const API_URL =
  'https://script.google.com/macros/s/AKfycby_cp7uJ6jVVQ4a0cMwhDlpTApxw_9bwzl6vqPlI2k9jUvMtJar33-r8eVUIO_bxX8e/exec';


/* =========================
   STATE
========================= */

let containers = [];
let currentPlan = null;
let autosaveTimer = null;


/* =========================
   ELEMENTS
========================= */

const dashboardView =
  document.getElementById('dashboardView');

const planView =
  document.getElementById('planView');

const plansList =
  document.getElementById('plansList');

const containersList =
  document.getElementById('containersList');

const newPlanBtn =
  document.getElementById('newPlanBtn');

const backBtn =
  document.getElementById('backBtn');

const saveStatus =
  document.getElementById('saveStatus');


/* MODAL */

const newPlanModal =
  document.getElementById('newPlanModal');

const closeModalBtn =
  document.getElementById('closeModalBtn');

const cancelPlanBtn =
  document.getElementById('cancelPlanBtn');

const newPlanForm =
  document.getElementById('newPlanForm');

const createPlanBtn =
  document.getElementById('createPlanBtn');

const containerType =
  document.getElementById('containerType');


/* PLAN VIEW */

const planTitle =
  document.getElementById('planTitle');

const planStatusText =
  document.getElementById('planStatusText');

const planEditForm =
  document.getElementById('planEditForm');

const editContainer =
  document.getElementById('editContainer');

const selectedContainerInfo =
  document.getElementById('selectedContainerInfo');


/* =========================
   API
========================= */

async function apiGet(action, params = {}) {

  const url = new URL(API_URL);

  url.searchParams.set(
    'action',
    action
  );

  Object.entries(params)
    .forEach(([key, value]) => {

      if (
        value !== undefined &&
        value !== null
      ) {

        url.searchParams.set(
          key,
          value
        );

      }

    });

  const response =
    await fetch(url.toString());

  const data =
    await response.json();

  return data;
}


async function apiPost(payload) {

  const response =
    await fetch(
      API_URL,
      {
        method: 'POST',

        /*
          text/plain avoids an unnecessary
          browser preflight request when
          talking to Apps Script.
        */
        headers: {
          'Content-Type':
            'text/plain;charset=utf-8'
        },

        body:
          JSON.stringify(payload)
      }
    );

  return response.json();
}


/* =========================
   INITIAL LOAD
========================= */

async function initialise() {

  await loadContainers();

  await loadPlans();

}


async function loadContainers() {

  try {

    const data =
      await apiGet('getContainers');

    if (!data.ok) {
      throw new Error(
        data.message ||
        'Unable to load containers.'
      );
    }

    containers =
      data.containers || [];

    renderContainers();

    populateContainerSelects();

  } catch (error) {

    containersList.innerHTML =
      `<p class="muted">
        ${escapeHtml(error.message)}
      </p>`;

  }
}


async function loadPlans() {

  try {

    const data =
      await apiGet('getPlans');

    if (!data.ok) {
      throw new Error(
        data.message ||
        'Unable to load plans.'
      );
    }

    renderPlans(
      data.plans || []
    );

  } catch (error) {

    plansList.innerHTML =
      `<p class="muted">
        ${escapeHtml(error.message)}
      </p>`;

  }
}


/* =========================
   RENDER DASHBOARD
========================= */

function renderPlans(plans) {

  if (!plans.length) {

    plansList.innerHTML =
      `
      <p class="muted">
        No stuffing plans yet.
      </p>
      `;

    return;
  }

  plansList.innerHTML = '';

  plans.forEach(plan => {

    const button =
      document.createElement('button');

    button.type = 'button';
    button.className = 'plan-row';

    button.innerHTML =
      `
      <div>

        <div class="plan-id">
          ${escapeHtml(
            plan.Plan_ID || ''
          )}
        </div>

        <div class="plan-buyer">
          ${escapeHtml(
            plan.Buyer_Name ||
            'Buyer not entered'
          )}
        </div>

        <div class="muted">

          ${escapeHtml(
            plan.Port_of_Loading ||
            '—'
          )}

          →

          ${escapeHtml(
            plan.Port_of_Discharge ||
            '—'
          )}

        </div>

        <div class="muted">

          ${escapeHtml(
            getContainerName(
              plan.Container_Type
            )
          )}

          ·

          ${escapeHtml(
            plan.Status ||
            'Draft'
          )}

        </div>

      </div>

      <div class="plan-arrow">
        ›
      </div>
      `;

    button.addEventListener(
      'click',
      () => openPlan(
        plan.Plan_ID
      )
    );

    plansList.appendChild(
      button
    );

  });
}


function renderContainers() {

  if (!containers.length) {

    containersList.innerHTML =
      `
      <p class="muted">
        No container presets found.
      </p>
      `;

    return;
  }

  containersList.innerHTML =
    containers
      .map(container => {

        return `
          <div class="container-row">

            <div class="container-name">

              ${escapeHtml(
                container.Container_Name
              )}

            </div>

            <div class="muted">

              ${formatNumber(
                container.Internal_Length_mm
              )}

              ×

              ${formatNumber(
                container.Internal_Width_mm
              )}

              ×

              ${formatNumber(
                container.Internal_Height_mm
              )}

              mm

            </div>

            <div class="muted">

              Payload:

              ${formatNumber(
                container.Max_Payload_Kg
              )}

              kg

            </div>

          </div>
        `;

      })
      .join('');
}


/* =========================
   CONTAINER SELECTS
========================= */

function populateContainerSelects() {

  const options =
    containers
      .map(container => {

        return `
          <option
            value="${escapeHtml(
              container.Container_ID
            )}"
          >
            ${escapeHtml(
              container.Container_Name
            )}
          </option>
        `;

      })
      .join('');

  containerType.innerHTML =
    `
    <option value="">
      Select container
    </option>
    ${options}
    `;

  editContainer.innerHTML =
    options;
}


/* =========================
   NEW PLAN MODAL
========================= */

function openNewPlanModal() {

  newPlanForm.reset();

  newPlanModal.classList.remove(
    'hidden'
  );

  document
    .getElementById('buyerName')
    .focus();

}


function closeNewPlanModal() {

  newPlanModal.classList.add(
    'hidden'
  );

}


newPlanBtn.addEventListener(
  'click',
  openNewPlanModal
);


closeModalBtn.addEventListener(
  'click',
  closeNewPlanModal
);


cancelPlanBtn.addEventListener(
  'click',
  closeNewPlanModal
);


newPlanModal.addEventListener(
  'click',
  event => {

    if (
      event.target ===
      newPlanModal
    ) {

      closeNewPlanModal();

    }

  }
);


/* =========================
   CREATE PLAN
========================= */

newPlanForm.addEventListener(
  'submit',
  async event => {

    event.preventDefault();

    createPlanBtn.disabled = true;
    createPlanBtn.textContent =
      'Creating...';

    try {

      const formData =
        new FormData(newPlanForm);

      const payload = {
        action:
          'createPlan'
      };

      formData.forEach(
        (value, key) => {

          payload[key] =
            String(value).trim();

        }
      );

      const result =
        await apiPost(payload);

      if (!result.ok) {

        throw new Error(
          result.message ||
          'Unable to create plan.'
        );

      }

      closeNewPlanModal();

      await loadPlans();

      await openPlan(
        result.planId
      );

    } catch (error) {

      alert(
        'Unable to create the stuffing plan.\n\n' +
        error.message
      );

    } finally {

      createPlanBtn.disabled = false;

      createPlanBtn.textContent =
        'Create Stuffing Plan';

    }

  }
);


/* =========================
   OPEN PLAN
========================= */

async function openPlan(planId) {

  showPlanLoading();

  try {

    const data =
      await apiGet(
        'getPlan',
        {
          planId:
            planId
        }
      );

    if (!data.ok) {

      throw new Error(
        data.message ||
        'Unable to load plan.'
      );

    }

    currentPlan =
      data.plan;

    populatePlanForm(
      currentPlan
    );

    renderSelectedContainer();

    dashboardView.classList.add(
      'hidden'
    );

    planView.classList.remove(
      'hidden'
    );

  } catch (error) {

    alert(
      'Unable to open plan.\n\n' +
      error.message
    );

    showDashboard();

  }

}


function showPlanLoading() {

  dashboardView.classList.add(
    'hidden'
  );

  planView.classList.remove(
    'hidden'
  );

  planTitle.textContent =
    'Loading plan...';

  planStatusText.textContent = '';

}


function showDashboard() {

  planView.classList.add(
    'hidden'
  );

  dashboardView.classList.remove(
    'hidden'
  );

  currentPlan = null;

  loadPlans();

}


backBtn.addEventListener(
  'click',
  showDashboard
);


/* =========================
   POPULATE PLAN FORM
========================= */

function populatePlanForm(plan) {

  planTitle.textContent =
    plan.Plan_ID;

  planStatusText.textContent =
    `${plan.Status || 'Draft'} · ${
      plan.Buyer_Name ||
      'Buyer not entered'
    }`;

  setField(
    'editBuyerName',
    plan.Buyer_Name
  );

  setField(
    'editInvoiceRef',
    plan.PO_Invoice_Ref
  );

  setField(
    'editContainer',
    plan.Container_Type
  );

  setField(
    'editContainerNumber',
    plan.Container_Number
  );

  setField(
    'editPortLoading',
    plan.Port_of_Loading
  );

  setField(
    'editPortDischarge',
    plan.Port_of_Discharge
  );

  setField(
    'editNotes',
    plan.Notes
  );

  setField(
    'editLoadingDate',
    normaliseDate(
      plan.Loading_Date
    )
  );

}


/* =========================
   AUTOSAVE PLAN
========================= */

planEditForm.addEventListener(
  'input',
  scheduleAutosave
);


planEditForm.addEventListener(
  'change',
  () => {

    scheduleAutosave();

    renderSelectedContainer();

  }
);


function scheduleAutosave() {

  if (!currentPlan) {
    return;
  }

  saveStatus.textContent =
    'Unsaved changes...';

  saveStatus.style.color =
    '#8a6513';

  clearTimeout(
    autosaveTimer
  );

  autosaveTimer =
    setTimeout(
      autosavePlan,
      1200
    );

}


async function autosavePlan() {

  if (!currentPlan) {
    return;
  }

  saveStatus.textContent =
    'Saving...';

  saveStatus.style.color =
    '#667085';

  try {

    const formData =
      new FormData(
        planEditForm
      );

    const payload = {
      action:
        'updatePlan',

      Plan_ID:
        currentPlan.Plan_ID
    };

    formData.forEach(
      (value, key) => {

        payload[key] =
          String(value).trim();

      }
    );

    const result =
      await apiPost(payload);

    if (!result.ok) {

      throw new Error(
        result.message ||
        'Save failed.'
      );

    }

    Object.assign(
      currentPlan,
      payload
    );

    planStatusText.textContent =
      `${currentPlan.Status || 'Draft'} · ${
        currentPlan.Buyer_Name ||
        'Buyer not entered'
      }`;

    saveStatus.textContent =
      '✓ Saved';

    saveStatus.style.color =
      '#188754';

  } catch (error) {

    saveStatus.textContent =
      'Save failed';

    saveStatus.style.color =
      '#b42318';

    console.error(
      error
    );

  }

}


/* =========================
   SELECTED CONTAINER
========================= */

function renderSelectedContainer() {

  const containerId =
    editContainer.value;

  const container =
    containers.find(
      item =>
        item.Container_ID ===
        containerId
    );

  if (!container) {

    selectedContainerInfo.innerHTML =
      `
      <p class="muted">
        Select a container.
      </p>
      `;

    return;
  }

  selectedContainerInfo.innerHTML =
    `

    <div class="summary-item">

      <div class="summary-label">
        Type
      </div>

      <div class="summary-value">
        ${escapeHtml(
          container.Container_Name
        )}
      </div>

    </div>


    <div class="summary-item">

      <div class="summary-label">
        Internal dimensions
      </div>

      <div class="summary-value">

        ${formatNumber(
          container.Internal_Length_mm
        )}

        ×

        ${formatNumber(
          container.Internal_Width_mm
        )}

        ×

        ${formatNumber(
          container.Internal_Height_mm
        )}

        mm

      </div>

    </div>


    <div class="summary-item">

      <div class="summary-label">
        Door opening
      </div>

      <div class="summary-value">

        ${formatNumber(
          container.Door_Width_mm
        )}

        ×

        ${formatNumber(
          container.Door_Height_mm
        )}

        mm

      </div>

    </div>


    <div class="summary-item">

      <div class="summary-label">
        Max payload
      </div>

      <div class="summary-value">

        ${formatNumber(
          container.Max_Payload_Kg
        )}

        kg

      </div>

    </div>

    `;
}


/* =========================
   HELPERS
========================= */

function getContainerName(id) {

  const container =
    containers.find(
      item =>
        item.Container_ID === id
    );

  return container
    ? container.Container_Name
    : id || 'No container';

}


function setField(id, value) {

  const element =
    document.getElementById(id);

  if (!element) {
    return;
  }

  element.value =
    value || '';

}


function normaliseDate(value) {

  if (!value) {
    return '';
  }

  return String(value)
    .substring(0, 10);

}


function formatNumber(value) {

  const number =
    Number(value || 0);

  return number.toLocaleString(
    'en-IN'
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


/* =========================
   START
========================= */

initialise();
