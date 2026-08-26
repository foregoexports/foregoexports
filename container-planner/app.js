import * as THREE from 'three';

import {
  OrbitControls
} from 'three/addons/controls/OrbitControls.js';


const API_URL =
  'https://script.google.com/macros/s/AKfycby_cp7uJ6jVVQ4a0cMwhDlpTApxw_9bwzl6vqPlI2k9jUvMtJar33-r8eVUIO_bxX8e/exec';


const STORAGE_KEY =
  'forego_container_planner';


const COLOURS = [
  '#4F7DF3',
  '#E8873A',
  '#40A578',
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


let containers = [];
let plan = null;
let items = [];

let packingResult = null;

let scene;
let camera;
let renderer;
let controls;

let cargoGroup;

let autoRotate = false;


/* =========================================================
   ELEMENTS
========================================================= */

const planNumber =
  document.getElementById(
    'planNumber'
  );

const containerSelect =
  document.getElementById(
    'containerSelect'
  );

const dimensionUnit =
  document.getElementById(
    'dimensionUnit'
  );

const weightUnit =
  document.getElementById(
    'weightUnit'
  );

const saveStatus =
  document.getElementById(
    'saveStatus'
  );

const cargoList =
  document.getElementById(
    'cargoList'
  );

const legend =
  document.getElementById(
    'legend'
  );

const fitResults =
  document.getElementById(
    'fitResults'
  );

const containerSpec =
  document.getElementById(
    'containerSpec'
  );

const viewer =
  document.getElementById(
    'viewer'
  );

const viewerLoading =
  document.getElementById(
    'viewerLoading'
  );


/* =========================================================
   API
========================================================= */

async function apiGet(
  action,
  params = {}
) {
  const url =
    new URL(API_URL);

  url.searchParams.set(
    'action',
    action
  );

  Object.entries(params)
    .forEach(
      ([key, value]) => {
        url.searchParams.set(
          key,
          value
        );
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
        method: 'POST',

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


/* =========================================================
   START
========================================================= */

async function start() {
  try {
    await loadContainers();

    initThree();

    const remembered =
      loadLocalPlan();

    if (remembered) {
      const loaded =
        await tryResumePlan(
          remembered
        );

      if (!loaded) {
        await createNewPlan();
      }

    } else {
      await createNewPlan();
    }

  } catch (error) {
    console.error(error);

    saveStatus.textContent =
      'Unable to initialise';
  }
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
   PLAN
========================================================= */

async function createNewPlan() {
  saveStatus.textContent =
    'Creating plan...';

  const container =
    containers[0];

  if (!container) {
    throw new Error(
      'No container preset found.'
    );
  }

  const result =
    await apiPost({
      action:
        'createPlan',

      Container_Type:
        container.Container_ID,

      Dimension_Unit:
        'in',

      Weight_Unit:
        'kg'
    });

  if (!result.ok) {
    throw new Error(
      result.message
    );
  }

  saveLocalPlan({
    planId:
      result.planId,

    planKey:
      result.planKey
  });

  await tryResumePlan({
    planId:
      result.planId,

    planKey:
      result.planKey
  });
}


async function tryResumePlan(
  credentials
) {
  try {
    const data =
      await apiGet(
        'getPlan',
        {
          planId:
            credentials.planId,

          planKey:
            credentials.planKey
        }
      );

    if (!data.ok) {
      return false;
    }

    plan = {
      ...data.plan,

      planKey:
        credentials.planKey
    };

    items =
      data.items || [];

    planNumber.textContent =
      plan.Plan_ID;

    containerSelect.value =
      plan.Container_Type ||
      containers[0]?.Container_ID ||
      '';

    dimensionUnit.value =
      plan.Dimension_Unit ||
      'in';

    weightUnit.value =
      plan.Weight_Unit ||
      'kg';

    saveStatus.textContent =
      '✓ Saved';

    refreshEverything();

    return true;

  } catch (error) {
    console.warn(
      'Unable to resume plan.',
      error
    );

    return false;
  }
}


async function savePlanSettings() {
  if (!plan) {
    return;
  }

  saveStatus.textContent =
    'Saving...';

  const result =
    await apiPost({
      action:
        'updatePlan',

      Plan_ID:
        plan.Plan_ID,

      planKey:
        plan.planKey,

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

    saveStatus.textContent =
      '✓ Saved';
  } else {
    saveStatus.textContent =
      'Save failed';
  }
}


/* =========================================================
   LOCAL PLAN
========================================================= */

function saveLocalPlan(
  value
) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(value)
  );
}


function loadLocalPlan() {
  try {
    const raw =
      localStorage.getItem(
        STORAGE_KEY
      );

    if (!raw) {
      return null;
    }

    return JSON.parse(raw);

  } catch {
    return null;
  }
}


/* =========================================================
   CARGO MODAL
========================================================= */

const cargoModal =
  document.getElementById(
    'cargoModal'
  );

const cargoForm =
  document.getElementById(
    'cargoForm'
  );

const cargoItemId =
  document.getElementById(
    'cargoItemId'
  );

const cargoModalTitle =
  document.getElementById(
    'cargoModalTitle'
  );


document
  .getElementById(
    'addCargoBtn'
  )
  .addEventListener(
    'click',
    () => {
      cargoForm.reset();

      cargoItemId.value =
        '';

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

      document
        .getElementById(
          'cargoMaxLayers'
        )
        .value =
          0;

      cargoModalTitle.textContent =
        'Add Product';

      updateCargoLabels();

      cargoModal.classList.remove(
        'hidden'
      );
    }
  );


document
  .getElementById(
    'closeCargoBtn'
  )
  .addEventListener(
    'click',
    closeCargoModal
  );


document
  .getElementById(
    'cancelCargoBtn'
  )
  .addEventListener(
    'click',
    closeCargoModal
  );


function closeCargoModal() {
  cargoModal.classList.add(
    'hidden'
  );
}


/* =========================================================
   SAVE CARGO
========================================================= */

cargoForm.addEventListener(
  'submit',
  async event => {
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

      Plan_ID:
        plan.Plan_ID,

      planKey:
        plan.planKey,

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

      Gross_Weight_Kg:
        weightToKG(
          document
            .getElementById(
              'cargoWeight'
            )
            .value
        ),

      Box_Thickness_mm:
        0,

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

    const result =
      await apiPost(
        payload
      );

    if (!result.ok) {
      alert(
        result.message ||
        'Unable to save cargo.'
      );

      return;
    }

    closeCargoModal();

    await reloadPlan();
  }
);


/* =========================================================
   EDIT / DELETE
========================================================= */

function editCargo(
  itemId
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

  updateCargoLabels();

  cargoModal.classList.remove(
    'hidden'
  );
}


async function deleteCargo(
  itemId
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

  if (
    !confirm(
      `Remove "${item.Product_Name}"?`
    )
  ) {
    return;
  }

  const result =
    await apiPost({
      action:
        'deleteItem',

      Item_ID:
        itemId,

      planKey:
        plan.planKey
    });

  if (!result.ok) {
    alert(
      result.message
    );

    return;
  }

  await reloadPlan();
}


/* =========================================================
   RELOAD
========================================================= */

async function reloadPlan() {
  const data =
    await apiGet(
      'getPlan',
      {
        planId:
          plan.Plan_ID,

        planKey:
          plan.planKey
      }
    );

  if (!data.ok) {
    throw new Error(
      data.message
    );
  }

  plan = {
    ...data.plan,
    planKey:
      plan.planKey
  };

  items =
    data.items || [];

  refreshEverything();
}


/* =========================================================
   REFRESH UI
========================================================= */

function refreshEverything() {
  renderCargoList();

  calculateTotals();

  packingResult =
    calculatePacking();

  renderFitResults(
    packingResult
  );

  renderLegend();

  renderContainerSpec();

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

  cargoList.innerHTML =
    '';

  items.forEach(item => {
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

      </div>


      <div class="cargo-meta">

        ${formatNumber(
          item.Quantity
        )}
        ${escapeHtml(
          item.Packing_Type
        )}

        <br>

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

      </div>


      <div class="cargo-card-actions">

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
          Remove
        </button>

      </div>
      `;

    card
      .querySelector(
        '.edit'
      )
      .addEventListener(
        'click',
        () =>
          editCargo(
            item.Item_ID
          )
      );

    card
      .querySelector(
        '.remove'
      )
      .addEventListener(
        'click',
        () =>
          deleteCargo(
            item.Item_ID
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

  let volumePct = 0;
  let payloadPct = 0;

  if (container) {
    const containerCBM =
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
    .getElementById(
      'totalPackages'
    )
    .textContent =
      formatNumber(
        packages
      );

  document
    .getElementById(
      'totalWeight'
    )
    .textContent =
      `${formatDecimal(
        weightFromKG(
          weightKG
        ),
        2
      )} ${weightLabel()}`;

  document
    .getElementById(
      'totalCBM'
    )
    .textContent =
      `${formatDecimal(
        cbm,
        3
      )} CBM`;

  document
    .getElementById(
      'volumeUsed'
    )
    .textContent =
      `${formatDecimal(
        volumePct,
        1
      )}%`;

  document
    .getElementById(
      'payloadUsed'
    )
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

  await apiPost({
    action:
      'updatePlan',

    Plan_ID:
      plan.Plan_ID,

    planKey:
      plan.planKey,

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
      item:
        item,

      requested:
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

function renderFitResults(
  result
) {
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
      .map(row => `
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

            <span>
              Requested
            </span>

            <strong>
              ${formatNumber(
                row.requested
              )}
            </strong>

          </div>


          <div class="fit-number">

            <span>
              Fits
            </span>

            <strong>
              ${formatNumber(
                row.fitted
              )}
            </strong>

          </div>


          <div
            class="
              fit-number
              ${
                row.remaining
                  ? 'remaining-warning'
                  : ''
              }
            "
          >

            <span>
              Remaining
            </span>

            <strong>
              ${formatNumber(
                row.remaining
              )}
            </strong>

          </div>

        </div>
      `)
      .join('');
}


/* =========================================================
   THREE.JS
========================================================= */

function initThree() {
  scene =
    new THREE.Scene();

  scene.background =
    new THREE.Color(
      0xf4f7fb
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

  controls.enableDamping =
    true;

  controls.dampingFactor =
    0.06;

  controls.autoRotateSpeed =
    1.2;

  scene.add(
    new THREE.HemisphereLight(
      0xffffff,
      0x617083,
      2.2
    )
  );

  const light =
    new THREE.DirectionalLight(
      0xffffff,
      2.4
    );

  light.position.set(
    6,
    10,
    8
  );

  scene.add(light);

  cargoGroup =
    new THREE.Group();

  scene.add(
    cargoGroup
  );

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

  while (
    cargoGroup.children.length
  ) {
    const child =
      cargoGroup.children[0];

    cargoGroup.remove(child);

    child.geometry?.dispose?.();

    if (
      Array.isArray(
        child.material
      )
    ) {
      child.material.forEach(
        m =>
          m.dispose?.()
      );
    } else {
      child.material
        ?.dispose?.();
    }
  }

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


  /* FLOOR */

  const floor =
    new THREE.Mesh(
      new THREE.BoxGeometry(
        scaledL,
        0.018,
        scaledW
      ),

      new THREE.MeshStandardMaterial({
        color: 0xdfe5ec,
        roughness: 0.85
      })
    );

  floor.position.set(
    scaledL / 2,
    -0.02,
    scaledW / 2
  );

  cargoGroup.add(
    floor
  );


  /* TRANSPARENT CONTAINER */

  const containerGeometry =
    new THREE.BoxGeometry(
      scaledL,
      scaledH,
      scaledW
    );

  const transparentShell =
    new THREE.Mesh(
      containerGeometry,

      new THREE.MeshBasicMaterial({
        color: 0x8b98a9,
        transparent: true,
        opacity: 0.035,
        side: THREE.DoubleSide
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


  const edges =
    new THREE.LineSegments(
      new THREE.EdgesGeometry(
        containerGeometry
      ),

      new THREE.LineBasicMaterial({
        color: 0x667488,
        transparent: true,
        opacity: 0.75
      })
    );

  edges.position.copy(
    transparentShell.position
  );

  cargoGroup.add(
    edges
  );


  /* BOXES */

  result.placements.forEach(
    placement => {
      const geometry =
        new THREE.BoxGeometry(
          placement.l *
          scale *
          0.985,

          placement.h *
          scale *
          0.985,

          placement.w *
          scale *
          0.985
        );

      const material =
        new THREE.MeshStandardMaterial({
          color:
            placement.colour ||
            '#64748B',

          roughness:
            0.48,

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

      cargoGroup.add(
        mesh
      );
    }
  );


  resetCamera();
}


function resetCamera() {
  const container =
    selectedContainer();

  if (!container) {
    return;
  }

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

  camera.position.set(
    7.8,
    5.3,
    8.1
  );

  controls.target.set(
    L / 2,
    H / 2,
    W / 2
  );

  controls.update();
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

  const height =
    viewer.clientWidth <
    650
      ? 350
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

  if (
    controls
  ) {
    controls.autoRotate =
      autoRotate;

    controls.update();
  }

  renderer?.render(
    scene,
    camera
  );
}


/* =========================================================
   LEGEND / SPEC
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

          ${escapeHtml(
            item.Product_Name
          )}

        </div>
      `)
      .join('');
}


function renderContainerSpec() {
  const container =
    selectedContainer();

  if (!container) {
    return;
  }

  containerSpec.textContent =
    `${
      container.Container_Name
    } · ${
      formatDimension(
        container.Internal_Length_mm
      )
    } × ${
      formatDimension(
        container.Internal_Width_mm
      )
    } × ${
      formatDimension(
        container.Internal_Height_mm
      )
    } ${
      dimensionLabel()
    } internal`;
}


/* =========================================================
   DOWNLOAD
========================================================= */

const leadModal =
  document.getElementById(
    'leadModal'
  );


document
  .getElementById(
    'downloadBtn'
  )
  .addEventListener(
    'click',
    () => {
      if (!items.length) {
        alert(
          'Add at least one cargo item before downloading.'
        );

        return;
      }

      leadModal.classList.remove(
        'hidden'
      );
    }
  );


document
  .getElementById(
    'closeLeadBtn'
  )
  .addEventListener(
    'click',
    closeLeadModal
  );


document
  .getElementById(
    'cancelLeadBtn'
  )
  .addEventListener(
    'click',
    closeLeadModal
  );


function closeLeadModal() {
  leadModal.classList.add(
    'hidden'
  );
}


document
  .getElementById(
    'leadForm'
  )
  .addEventListener(
    'submit',
    async event => {
      event.preventDefault();

      const result =
        await apiPost({
          action:
            'saveLead',

          Plan_ID:
            plan.Plan_ID,

          planKey:
            plan.planKey,

          Name:
            document
              .getElementById(
                'leadName'
              )
              .value
              .trim(),

          Mobile:
            document
              .getElementById(
                'leadMobile'
              )
              .value
              .trim(),

          Email:
            document
              .getElementById(
                'leadEmail'
              )
              .value
              .trim(),

          Company:
            document
              .getElementById(
                'leadCompany'
              )
              .value
              .trim()
        });

      if (!result.ok) {
        alert(
          result.message
        );

        return;
      }

      closeLeadModal();

      preparePrint();

      setTimeout(
        () =>
          window.print(),
        200
      );
    }
  );


function preparePrint() {
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
          container.Container_Name
        )}
      </p>

      <p>
        <strong>Products:</strong>
        ${items.length}
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
}


/* =========================================================
   CONTROLS
========================================================= */

containerSelect.addEventListener(
  'change',
  async () => {
    await savePlanSettings();

    refreshEverything();
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
  .getElementById(
    'optimiseBtn'
  )
  .addEventListener(
    'click',
    refreshEverything
  );


document
  .getElementById(
    'resetViewBtn'
  )
  .addEventListener(
    'click',
    resetCamera
  );


document
  .getElementById(
    'rotateViewBtn'
  )
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
  .getElementById(
    'newPlanBtn'
  )
  .addEventListener(
    'click',
    async () => {
      if (
        !confirm(
          'Start a new loading plan?'
        )
      ) {
        return;
      }

      localStorage.removeItem(
        STORAGE_KEY
      );

      await createNewPlan();
    }
  );


/* =========================================================
   UNITS
========================================================= */

function dimensionToMM(
  value
) {
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


function dimensionFromMM(
  value
) {
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


function weightToKG(
  value
) {
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


function weightFromKG(
  value
) {
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


function formatDimension(
  mm
) {
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
    .getElementById(
      'lengthLabel'
    )
    .textContent =
      `Length (${d})`;

  document
    .getElementById(
      'widthLabel'
    )
    .textContent =
      `Width (${d})`;

  document
    .getElementById(
      'heightLabel'
    )
    .textContent =
      `Height (${d})`;

  document
    .getElementById(
      'weightLabel'
    )
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


function toBoolean(
  value
) {
  return (
    value === true ||
    String(value)
      .toUpperCase() ===
      'TRUE' ||
    String(value) === '1'
  );
}


function setValue(
  id,
  value
) {
  document
    .getElementById(id)
    .value =
      value ?? '';
}


function formatNumber(
  value
) {
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


function escapeHtml(
  value
) {
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
