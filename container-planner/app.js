const API_URL =
  'https://script.google.com/macros/s/AKfycby_cp7uJ6jVVQ4a0cMwhDlpTApxw_9bwzl6vqPlI2k9jUvMtJar33-r8eVUIO_bxX8e/exec';


/* =========================
   STATE
========================= */

let containers = [];
let currentPlan = null;
let currentItems = [];

let autosaveTimer = null;


/* =========================
   COLOURS
========================= */

const CARGO_COLOURS = [
  '#4F7DF3',
  '#E8873A',
  '#40A578',
  '#8B65D5',
  '#D95D78',
  '#29A8B8',
  '#D5A62E',
  '#64748B'
];


/* =========================
   UNITS
========================= */

const DIMENSION_UNITS = {

  mm: {
    label: 'mm',
    toMM: 1
  },

  cm: {
    label: 'cm',
    toMM: 10
  },

  in: {
    label: 'in',
    toMM: 25.4
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


/* =========================
   ELEMENTS
========================= */

const dashboardView =
  document.getElementById(
    'dashboardView'
  );

const planView =
  document.getElementById(
    'planView'
  );

const plansList =
  document.getElementById(
    'plansList'
  );

const containersList =
  document.getElementById(
    'containersList'
  );

const newPlanBtn =
  document.getElementById(
    'newPlanBtn'
  );

const backBtn =
  document.getElementById(
    'backBtn'
  );

const saveStatus =
  document.getElementById(
    'saveStatus'
  );


/* NEW PLAN */

const newPlanModal =
  document.getElementById(
    'newPlanModal'
  );

const closeModalBtn =
  document.getElementById(
    'closeModalBtn'
  );

const cancelPlanBtn =
  document.getElementById(
    'cancelPlanBtn'
  );

const newPlanForm =
  document.getElementById(
    'newPlanForm'
  );

const createPlanBtn =
  document.getElementById(
    'createPlanBtn'
  );

const containerType =
  document.getElementById(
    'containerType'
  );


/* PLAN */

const planTitle =
  document.getElementById(
    'planTitle'
  );

const planStatusText =
  document.getElementById(
    'planStatusText'
  );

const planEditForm =
  document.getElementById(
    'planEditForm'
  );

const editContainer =
  document.getElementById(
    'editContainer'
  );

const editDimensionUnit =
  document.getElementById(
    'editDimensionUnit'
  );

const editWeightUnit =
  document.getElementById(
    'editWeightUnit'
  );

const selectedContainerInfo =
  document.getElementById(
    'selectedContainerInfo'
  );


/* CARGO */

const addCargoBtn =
  document.getElementById(
    'addCargoBtn'
  );

const cargoModal =
  document.getElementById(
    'cargoModal'
  );

const cargoModalTitle =
  document.getElementById(
    'cargoModalTitle'
  );

const cargoForm =
  document.getElementById(
    'cargoForm'
  );

const closeCargoBtn =
  document.getElementById(
    'closeCargoBtn'
  );

const cancelCargoBtn =
  document.getElementById(
    'cancelCargoBtn'
  );

const saveCargoBtn =
  document.getElementById(
    'saveCargoBtn'
  );

const cargoItemId =
  document.getElementById(
    'cargoItemId'
  );

const cargoList =
  document.getElementById(
    'cargoList'
  );


/* TOTALS */

const totalPackages =
  document.getElementById(
    'totalPackages'
  );

const totalWeight =
  document.getElementById(
    'totalWeight'
  );

const totalCBM =
  document.getElementById(
    'totalCBM'
  );

const volumePercent =
  document.getElementById(
    'volumePercent'
  );

const payloadPercent =
  document.getElementById(
    'payloadPercent'
  );


/* =========================
   API
========================= */

async function apiGet(
  action,
  params = {}
) {

  const url =
    new URL(
      API_URL
    );

  url.searchParams.set(
    'action',
    action
  );

  Object.entries(
    params
  ).forEach(
    ([key, value]) => {

      if (
        value !== undefined &&
        value !== null
      ) {

        url.searchParams.set(
          key,
          value
        );

      }

    }
  );

  const response =
    await fetch(
      url.toString()
    );

  return response.json();
}


async function apiPost(
  payload
) {

  const response =
    await fetch(
      API_URL,
      {

        method:
          'POST',

        headers: {
          'Content-Type':
            'text/plain;charset=utf-8'
        },

        body:
          JSON.stringify(
            payload
          )

      }
    );

  return response.json();
}


/* =========================
   INITIALISE
========================= */

async function initialise() {

  await loadContainers();

  await loadPlans();

}


async function loadContainers() {

  try {

    const data =
      await apiGet(
        'getContainers'
      );

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
      `
      <p class="muted">
        ${escapeHtml(
          error.message
        )}
      </p>
      `;

  }

}


async function loadPlans() {

  try {

    const data =
      await apiGet(
        'getPlans'
      );

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
      `
      <p class="muted">
        ${escapeHtml(
          error.message
        )}
      </p>
      `;

  }

}


/* =========================
   DASHBOARD
========================= */

function renderPlans(
  plans
) {

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


  plans.forEach(
    plan => {

      const button =
        document.createElement(
          'button'
        );

      button.type =
        'button';

      button.className =
        'plan-row';


      button.innerHTML =
        `
        <div>

          <div class="plan-id">

            ${escapeHtml(
              plan.Plan_ID
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
        () => {

          openPlan(
            plan.Plan_ID
          );

        }
      );


      plansList.appendChild(
        button
      );

    }
  );

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
      .map(
        container => {

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

        }
      )
      .join('');

}


/* =========================
   CONTAINER SELECTS
========================= */

function populateContainerSelects() {

  const options =
    containers
      .map(
        container => {

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

        }
      )
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

newPlanBtn.addEventListener(
  'click',
  () => {

    newPlanForm.reset();

    newPlanModal.classList.remove(
      'hidden'
    );

    document
      .getElementById(
        'buyerName'
      )
      .focus();

  }
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


function closeNewPlanModal() {

  newPlanModal.classList.add(
    'hidden'
  );

}


/* =========================
   CREATE PLAN
========================= */

newPlanForm.addEventListener(
  'submit',
  async event => {

    event.preventDefault();


    createPlanBtn.disabled =
      true;


    createPlanBtn.textContent =
      'Creating...';


    try {

      const formData =
        new FormData(
          newPlanForm
        );


      const payload = {

        action:
          'createPlan'

      };


      formData.forEach(
        (value, key) => {

          payload[key] =
            String(
              value
            ).trim();

        }
      );


      const result =
        await apiPost(
          payload
        );


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

      createPlanBtn.disabled =
        false;


      createPlanBtn.textContent =
        'Create Stuffing Plan';

    }

  }
);


/* =========================
   OPEN PLAN
========================= */

async function openPlan(
  planId
) {

  dashboardView.classList.add(
    'hidden'
  );


  planView.classList.remove(
    'hidden'
  );


  planTitle.textContent =
    'Loading plan...';


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


    currentItems =
      data.items || [];


    populatePlanForm();


    renderSelectedContainer();


    renderCargo();


    calculateCargoTotals(
      false
    );


  } catch (error) {

    alert(
      'Unable to open plan.\n\n' +
      error.message
    );


    showDashboard();

  }

}


function showDashboard() {

  planView.classList.add(
    'hidden'
  );


  dashboardView.classList.remove(
    'hidden'
  );


  currentPlan = null;

  currentItems = [];


  loadPlans();

}


backBtn.addEventListener(
  'click',
  showDashboard
);


/* =========================
   POPULATE PLAN
========================= */

function populatePlanForm() {

  const plan =
    currentPlan;


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
    'editDimensionUnit',
    plan.Dimension_Unit ||
    'mm'
  );


  setField(
    'editWeightUnit',
    plan.Weight_Unit ||
    'kg'
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


  updateUnitUI();

}


/* =========================
   PLAN AUTOSAVE
========================= */

planEditForm.addEventListener(
  'input',
  scheduleAutosave
);


planEditForm.addEventListener(
  'change',
  () => {

    scheduleAutosave();


    updateUnitUI();


    renderSelectedContainer();


    renderCargo();


    calculateCargoTotals(
      true
    );

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
          String(
            value
          ).trim();

      }
    );


    const result =
      await apiPost(
        payload
      );


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
   CONTAINER SUMMARY
========================= */

function renderSelectedContainer() {

  const container =
    getSelectedContainer();


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

        ${getDimensionLabel()}

      </div>

    </div>


    <div class="summary-item">

      <div class="summary-label">
        Door opening
      </div>

      <div class="summary-value">

        ${formatDimension(
          container.Door_Width_mm
        )}

        ×

        ${formatDimension(
          container.Door_Height_mm
        )}

        ${getDimensionLabel()}

      </div>

    </div>


    <div class="summary-item">

      <div class="summary-label">
        Max payload
      </div>

      <div class="summary-value">

        ${formatDecimal(
          weightFromKG(
            container.Max_Payload_Kg
          ),
          1
        )}

        ${getWeightLabel()}

      </div>

    </div>

    `;

}


/* =========================
   CARGO MODAL
========================= */

addCargoBtn.addEventListener(
  'click',
  openNewCargo
);


closeCargoBtn.addEventListener(
  'click',
  closeCargoModal
);


cancelCargoBtn.addEventListener(
  'click',
  closeCargoModal
);


cargoModal.addEventListener(
  'click',
  event => {

    if (
      event.target ===
      cargoModal
    ) {

      closeCargoModal();

    }

  }
);


function openNewCargo() {

  cargoForm.reset();


  cargoItemId.value =
    '';


  document
    .getElementById(
      'cargoThickness'
    )
    .value =
      0;


  document
    .getElementById(
      'cargoMaxLayers'
    )
    .value =
      0;


  document
    .getElementById(
      'cargoRotate'
    )
    .checked =
      true;


  document
    .getElementById(
      'cargoStackable'
    )
    .checked =
      true;


  cargoModalTitle.textContent =
    'Add Cargo';


  saveCargoBtn.textContent =
    'Add Cargo';


  updateUnitUI();


  cargoModal.classList.remove(
    'hidden'
  );

}


function closeCargoModal() {

  cargoModal.classList.add(
    'hidden'
  );

}


/* =========================
   SAVE CARGO
========================= */

cargoForm.addEventListener(
  'submit',
  async event => {

    event.preventDefault();


    if (!currentPlan) {
      return;
    }


    const editingId =
      cargoItemId.value;


    saveCargoBtn.disabled =
      true;


    saveCargoBtn.textContent =
      'Saving...';


    try {

      const payload = {

        action:
          editingId
            ? 'updateItem'
            : 'addItem',


        Plan_ID:
          currentPlan.Plan_ID,


        Product_Name:
          document
            .getElementById(
              'cargoProduct'
            )
            .value
            .trim(),


        Packing_Type:
          document
            .getElementById(
              'cargoPackingType'
            )
            .value,


        Quantity:
          Number(
            document
              .getElementById(
                'cargoQuantity'
              )
              .value
          ),


        Length_mm:
          dimensionToMM(
            document
              .getElementById(
                'cargoLength'
              )
              .value
          ),


        Width_mm:
          dimensionToMM(
            document
              .getElementById(
                'cargoWidth'
              )
              .value
          ),


        Height_mm:
          dimensionToMM(
            document
              .getElementById(
                'cargoHeight'
              )
              .value
          ),


        Box_Thickness_mm:
          dimensionToMM(
            document
              .getElementById(
                'cargoThickness'
              )
              .value ||
            0
          ),


        Gross_Weight_Kg:
          weightToKG(
            document
              .getElementById(
                'cargoWeight'
              )
              .value
          ),


        Max_Layers:
          Number(
            document
              .getElementById(
                'cargoMaxLayers'
              )
              .value ||
            0
          ),


        Rotate_Horizontal:
          document
            .getElementById(
              'cargoRotate'
            )
            .checked,


        Turn_Sideways:
          document
            .getElementById(
              'cargoSideways'
            )
            .checked,


        Turn_Upside_Down:
          document
            .getElementById(
              'cargoUpside'
            )
            .checked,


        Stackable:
          document
            .getElementById(
              'cargoStackable'
            )
            .checked

      };


      if (editingId) {

        payload.Item_ID =
          editingId;


        const existing =
          currentItems.find(
            item =>
              item.Item_ID ===
              editingId
          );


        payload.Colour =
          existing?.Colour ||
          chooseCargoColour();

      } else {

        payload.Colour =
          chooseCargoColour();


        payload.Loading_Order =
          currentItems.length + 1;

      }


      const result =
        await apiPost(
          payload
        );


      if (!result.ok) {

        throw new Error(
          result.message ||
          'Unable to save cargo.'
        );

      }


      closeCargoModal();


      await refreshCurrentPlan();


  } catch (error) {

      alert(
        'Unable to save cargo.\n\n' +
        error.message
      );

    } finally {

      saveCargoBtn.disabled =
        false;


      saveCargoBtn.textContent =
        editingId
          ? 'Save Changes'
          : 'Add Cargo';

    }

  }
);


/* =========================
   REFRESH CURRENT PLAN
========================= */

async function refreshCurrentPlan() {

  const data =
    await apiGet(
      'getPlan',
      {

        planId:
          currentPlan.Plan_ID

      }
    );


  if (!data.ok) {

    throw new Error(
      data.message ||
      'Unable to refresh plan.'
    );

  }


  currentPlan =
    data.plan;


  currentItems =
    data.items || [];


  populatePlanForm();


  renderSelectedContainer();


  renderCargo();


  await calculateCargoTotals(
    true
  );

}


/* =========================
   RENDER CARGO
========================= */

function renderCargo() {

  if (!currentItems.length) {

    cargoList.innerHTML =
      `
      <div class="empty-state">
        No cargo added yet.
      </div>
      `;

    return;
  }


  cargoList.innerHTML =
    '';


  currentItems.forEach(
    item => {

      const totalItemWeightKG =
        Number(
          item.Gross_Weight_Kg ||
          0
        ) *
        Number(
          item.Quantity ||
          0
        );


      const itemCBM =
        calculateItemCBM(
          item
        );


      const card =
        document.createElement(
          'div'
        );


      card.className =
        'cargo-card';


      card.innerHTML =
        `

        <div
          class="cargo-colour"
          style="
            background:
            ${escapeHtml(
              item.Colour ||
              '#64748B'
            )}
          "
        ></div>


        <div>

          <div class="cargo-name">

            ${escapeHtml(
              item.Product_Name
            )}

          </div>


          <div class="cargo-meta">

            <span>

              ${formatNumber(
                item.Quantity
              )}

              ${escapeHtml(
                item.Packing_Type
              )}

            </span>


            <span>

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

              ${getDimensionLabel()}

            </span>


            <span>

              ${formatDecimal(
                weightFromKG(
                  totalItemWeightKG
                ),
                2
              )}

              ${getWeightLabel()}

            </span>


            <span>

              ${formatDecimal(
                itemCBM,
                3
              )}

              CBM

            </span>

          </div>

        </div>


        <div class="cargo-actions">

          <button
            type="button"
            class="small-btn edit-btn"
          >
            Edit
          </button>

          <button
            type="button"
            class="small-btn danger delete-btn"
          >
            Remove
          </button>

        </div>

        `;


      card
        .querySelector(
          '.edit-btn'
        )
        .addEventListener(
          'click',
          () => {

            editCargo(
              item.Item_ID
            );

          }
        );


      card
        .querySelector(
          '.delete-btn'
        )
        .addEventListener(
          'click',
          () => {

            deleteCargo(
              item.Item_ID
            );

          }
        );


      cargoList.appendChild(
        card
      );

    }
  );

}


/* =========================
   EDIT CARGO
========================= */

function editCargo(
  itemId
) {

  const item =
    currentItems.find(
      row =>
        row.Item_ID ===
        itemId
    );


  if (!item) {
    return;
  }


  cargoForm.reset();


  cargoItemId.value =
    item.Item_ID;


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
    'cargoThickness',
    dimensionFromMM(
      item.Box_Thickness_mm
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
    .getElementById(
      'cargoRotate'
    )
    .checked =
      toBoolean(
        item.Rotate_Horizontal
      );


  document
    .getElementById(
      'cargoSideways'
    )
    .checked =
      toBoolean(
        item.Turn_Sideways
      );


  document
    .getElementById(
      'cargoUpside'
    )
    .checked =
      toBoolean(
        item.Turn_Upside_Down
      );


  document
    .getElementById(
      'cargoStackable'
    )
    .checked =
      toBoolean(
        item.Stackable
      );


  cargoModalTitle.textContent =
    'Edit Cargo';


  saveCargoBtn.textContent =
    'Save Changes';


  updateUnitUI();


  cargoModal.classList.remove(
    'hidden'
  );

}


/* =========================
   DELETE CARGO
========================= */

async function deleteCargo(
  itemId
) {

  const item =
    currentItems.find(
      row =>
        row.Item_ID ===
        itemId
    );


  if (!item) {
    return;
  }


  const confirmed =
    confirm(
      `Remove "${item.Product_Name}" from this stuffing plan?`
    );


  if (!confirmed) {
    return;
  }


  try {

    const result =
      await apiPost(
        {

          action:
            'deleteItem',

          Item_ID:
            itemId

        }
      );


    if (!result.ok) {

      throw new Error(
        result.message ||
        'Unable to remove cargo.'
      );

    }


    await refreshCurrentPlan();


  } catch (error) {

    alert(
      'Unable to remove cargo.\n\n' +
      error.message
    );

  }

}


/* =========================
   TOTALS
========================= */

async function calculateCargoTotals(
  saveToSheet
) {

  let packages = 0;

  let weightKG = 0;

  let cbm = 0;


  currentItems.forEach(
    item => {

      const qty =
        Number(
          item.Quantity ||
          0
        );


      packages +=
        qty;


      weightKG +=
        Number(
          item.Gross_Weight_Kg ||
          0
        ) *
        qty;


      cbm +=
        calculateItemCBM(
          item
        );

    }
  );


  const container =
    getSelectedContainer();


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


    if (
      containerCBM >
      0
    ) {

      volumePct =
        cbm /
        containerCBM *
        100;

    }


    const maxPayload =
      Number(
        container.Max_Payload_Kg ||
        0
      );


    if (
      maxPayload >
      0
    ) {

      payloadPct =
        weightKG /
        maxPayload *
        100;

    }

  }


  totalPackages.textContent =
    formatNumber(
      packages
    );


  totalWeight.textContent =
    `${formatDecimal(
      weightFromKG(
        weightKG
      ),
      2
    )} ${getWeightLabel()}`;


  totalCBM.textContent =
    `${formatDecimal(
      cbm,
      3
    )} CBM`;


  volumePercent.textContent =
    `${formatDecimal(
      volumePct,
      1
    )}%`;


  payloadPercent.textContent =
    `${formatDecimal(
      payloadPct,
      1
    )}%`;


  if (
    saveToSheet &&
    currentPlan
  ) {

    try {

      await apiPost(
        {

          action:
            'updatePlan',

          Plan_ID:
            currentPlan.Plan_ID,

          Total_Packages:
            packages,

          Total_Gross_Weight_Kg:
            Number(
              weightKG.toFixed(
                2
              )
            ),

          Cargo_Volume_CBM:
            Number(
              cbm.toFixed(
                3
              )
            ),

          Container_Volume_Used_Pct:
            Number(
              volumePct.toFixed(
                2
              )
            ),

          Payload_Used_Pct:
            Number(
              payloadPct.toFixed(
                2
              )
            )

        }
      );


    } catch (error) {

      console.error(
        'Unable to save cargo totals.',
        error
      );

    }

  }

}


function calculateItemCBM(
  item
) {

  return (
    Number(
      item.Length_mm ||
      0
    ) *

    Number(
      item.Width_mm ||
      0
    ) *

    Number(
      item.Height_mm ||
      0
    ) *

    Number(
      item.Quantity ||
      0
    )
  ) /
  1000000000;

}


/* =========================
   COLOURS
========================= */

function chooseCargoColour() {

  const used =
    currentItems.map(
      item =>
        item.Colour
    );


  const unused =
    CARGO_COLOURS.find(
      colour =>
        !used.includes(
          colour
        )
    );


  if (unused) {
    return unused;
  }


  return CARGO_COLOURS[
    currentItems.length %
    CARGO_COLOURS.length
  ];

}


/* =========================
   UNITS
========================= */

function getDimensionUnit() {

  const unit =
    editDimensionUnit?.value ||
    currentPlan?.Dimension_Unit ||
    'mm';


  return DIMENSION_UNITS[
    unit
  ]
    ? unit
    : 'mm';

}


function getWeightUnit() {

  const unit =
    editWeightUnit?.value ||
    currentPlan?.Weight_Unit ||
    'kg';


  return WEIGHT_UNITS[
    unit
  ]
    ? unit
    : 'kg';

}


function getDimensionLabel() {

  return DIMENSION_UNITS[
    getDimensionUnit()
  ].label;

}


function getWeightLabel() {

  return WEIGHT_UNITS[
    getWeightUnit()
  ].label;

}


function dimensionToMM(
  value
) {

  const number =
    Number(
      value ||
      0
    );


  const unit =
    DIMENSION_UNITS[
      getDimensionUnit()
    ];


  return Number(
    (
      number *
      unit.toMM
    ).toFixed(
      3
    )
  );

}


function dimensionFromMM(
  value
) {

  const number =
    Number(
      value ||
      0
    );


  const unit =
    DIMENSION_UNITS[
      getDimensionUnit()
    ];


  return Number(
    (
      number /
      unit.toMM
    ).toFixed(
      3
    )
  );

}


function weightToKG(
  value
) {

  const number =
    Number(
      value ||
      0
    );


  const unit =
    WEIGHT_UNITS[
      getWeightUnit()
    ];


  return Number(
    (
      number *
      unit.toKG
    ).toFixed(
      4
    )
  );

}


function weightFromKG(
  value
) {

  const number =
    Number(
      value ||
      0
    );


  const unit =
    WEIGHT_UNITS[
      getWeightUnit()
    ];


  return Number(
    (
      number /
      unit.toKG
    ).toFixed(
      3
    )
  );

}


function formatDimension(
  value
) {

  const converted =
    dimensionFromMM(
      value
    );


  const unit =
    getDimensionUnit();


  let digits = 0;


  if (
    unit ===
    'cm'
  ) {

    digits = 1;

  }


  if (
    unit ===
      'in' ||
    unit ===
      'ft'
  ) {

    digits = 2;

  }


  return Number(
    converted
  )
    .toLocaleString(
      'en-IN',
      {

        minimumFractionDigits:
          digits,

        maximumFractionDigits:
          digits

      }
    );

}


function updateUnitUI() {

  const dimensionLabel =
    getDimensionLabel();


  const weightLabel =
    getWeightLabel();


  document
    .getElementById(
      'cargoLengthLabel'
    )
    .textContent =
      `Length (${dimensionLabel})`;


  document
    .getElementById(
      'cargoWidthLabel'
    )
    .textContent =
      `Width (${dimensionLabel})`;


  document
    .getElementById(
      'cargoHeightLabel'
    )
    .textContent =
      `Height (${dimensionLabel})`;


  document
    .getElementById(
      'cargoThicknessLabel'
    )
    .textContent =
      `Box Thickness (${dimensionLabel})`;


  document
    .getElementById(
      'cargoWeightLabel'
    )
    .textContent =
      `Gross Weight / Package (${weightLabel})`;

}


/* =========================
   HELPERS
========================= */

function getSelectedContainer() {

  return containers.find(
    container =>
      container.Container_ID ===
      editContainer.value
  );

}


function getContainerName(
  id
) {

  const container =
    containers.find(
      item =>
        item.Container_ID ===
        id
    );


  return container
    ? container.Container_Name
    : id ||
      'No container';

}


function setField(
  id,
  value
) {

  const element =
    document.getElementById(
      id
    );


  if (!element) {
    return;
  }


  element.value =
    value ||
    '';

}


function setValue(
  id,
  value
) {

  const element =
    document.getElementById(
      id
    );


  if (!element) {
    return;
  }


  element.value =
    value ??
    '';

}


function normaliseDate(
  value
) {

  if (!value) {
    return '';
  }


  return String(
    value
  )
    .substring(
      0,
      10
    );

}


function formatNumber(
  value
) {

  return Number(
    value ||
    0
  )
    .toLocaleString(
      'en-IN'
    );

}


function formatDecimal(
  value,
  digits
) {

  return Number(
    value ||
    0
  )
    .toLocaleString(
      'en-IN',
      {

        minimumFractionDigits:
          digits,

        maximumFractionDigits:
          digits

      }
    );

}


function toBoolean(
  value
) {

  return (
    value === true ||
    String(
      value
    ).toUpperCase() ===
      'TRUE' ||
    String(
      value
    ) ===
      '1'
  );

}


function escapeHtml(
  value
) {

  return String(
    value ??
    ''
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
