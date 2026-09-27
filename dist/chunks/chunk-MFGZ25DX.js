// js/modules/generic/cycleStepper.js
function cycleStepper({ options, get, set, render, className = "" }) {
  const row = document.createElement("div");
  row.className = `cycle-stepper ${className}`.trim();
  const center = document.createElement("button");
  center.type = "button";
  center.className = "cycle-stepper-current";
  const refresh = () => render(center, get());
  const move = (step, e) => {
    const list = options();
    const i = Math.max(0, list.indexOf(get()));
    set(list[(i + step + list.length) % list.length], e);
    refresh();
  };
  const mkArrow = (text, step) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cycle-stepper-arrow";
    b.textContent = text;
    b.addEventListener("click", (e) => move(step, e));
    return b;
  };
  center.addEventListener("click", (e) => move(1, e));
  row.append(mkArrow("\u2039", -1), center, mkArrow("\u203A", 1));
  refresh();
  row._refresh = refresh;
  return row;
}

export {
  cycleStepper
};
