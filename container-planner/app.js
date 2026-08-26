const API_URL =
  'https://script.google.com/macros/s/AKfycby_cp7uJ6jVVQ4a0cMwhDlpTApxw_9bwzl6vqPlI2k9jUvMtJar33-r8eVUIO_bxX8e/exec';


const plansList =
  document.getElementById('plansList');

const containersList =
  document.getElementById('containersList');

const newPlanBtn =
  document.getElementById('newPlanBtn');


async function apiGet(action, params = {}) {

  const url = new URL(API_URL);

  url.searchParams.set(
    'action',
    action
  );

  Object.entries(params)
    .forEach(([key, value]) => {
      url.searchParams.set(
        key,
        value
      );
    });

  const response =
    await fetch(url);

  return response.json();
}


async function loadPlans() {

  try {

    const data =
      await apiGet('getPlans');

    if (!data.ok) {
      throw new Error(
        data.message || 'Unable to load plans.'
      );
    }

    if (!data.plans.length) {

      plansList.innerHTML =
        '<p class="muted">No stuffing plans yet.</p>';

      return;
    }

    plansList.innerHTML =
      data.plans
        .map(plan => {

          return `
            <div class="plan-row">

              <div class="plan-id">
                ${plan.Plan_ID}
              </div>

              <div>
                ${plan.Buyer_Name || 'No buyer entered'}
              </div>

              <div class="muted">
                ${plan.Port_of_Loading || '—'}
                →
                ${plan.Port_of_Discharge || '—'}
              </div>

              <div class="muted">
                ${plan.Container_Type || 'No container'}
                ·
                ${plan.Status || 'Draft'}
              </div>

            </div>
          `;

        })
        .join('');

  } catch (error) {

    plansList.innerHTML =
      `<p class="muted">${error.message}</p>`;

  }
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

    if (!data.containers.length) {

      containersList.innerHTML =
        '<p class="muted">No container presets found.</p>';

      return;
    }

    containersList.innerHTML =
      data.containers
        .map(container => {

          return `
            <div class="container-row">

              <div class="plan-id">
                ${container.Container_Name}
              </div>

              <div class="muted">
                ${container.Internal_Length_mm}
                ×
                ${container.Internal_Width_mm}
                ×
                ${container.Internal_Height_mm}
                mm
              </div>

              <div class="muted">
                Payload:
                ${Number(
                  container.Max_Payload_Kg
                ).toLocaleString()}
                kg
              </div>

            </div>
          `;

        })
        .join('');

  } catch (error) {

    containersList.innerHTML =
      `<p class="muted">${error.message}</p>`;

  }
}


newPlanBtn.addEventListener(
  'click',
  () => {

    alert(
      'New Stuffing Plan screen is the next step.'
    );

  }
);


loadPlans();
loadContainers();
