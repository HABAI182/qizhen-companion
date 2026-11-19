//! Passive, local measurements for the Windows test build. Never ships in a
//! normal build. No input injection, debug port, label history, or IPC changes.
use crate::app::{input_metrics, window_diagnostics, AppState};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    fs, io,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Context, Manager, Wry};

const QA_ID: &str = "local.habai182.zju-companion.qa";
const LIFETIME: Duration = Duration::from_secs(1_200);
const SAMPLE: Duration = Duration::from_millis(80);
const PHASES: &[&str] = &[
    "startup",
    "idle",
    "keyboard",
    "held",
    "released",
    "two-keys",
    "mouse",
    "combined",
    "gaze",
    "menu",
    "drag",
    "settings",
    "restart",
    "transparent",
    "opaque",
    "full-through",
    "recover",
];
const PARAMETER_NAMES: &[&str] = &[
    "ParamAngleX",
    "ParamAngleY",
    "ParamAngleZ",
    "ParamEyeLOpen",
    "ParamEyeROpen",
    "ParamEyeBallX",
    "ParamEyeBallY",
    "ParamHandLPress",
    "ParamHandLX",
    "ParamHandLY",
    "ParamHandRPress",
    "ParamHandRX",
    "ParamHandRY",
    "ParamHairFront",
    "ParamHairSide",
    "ParamHairBack",
    "ParamBreath",
    "ParamMouthForm",
    "ParamMouthOpenY",
];

#[derive(Default)]
struct Edges {
    down: AtomicU64,
    repeat: AtomicU64,
    up: AtomicU64,
}

impl Edges {
    fn snapshot(&self) -> [u64; 3] {
        [&self.down, &self.repeat, &self.up].map(|count| count.load(Ordering::Relaxed))
    }
}

static NON_INJECTED: Edges = Edges {
    down: AtomicU64::new(0),
    repeat: AtomicU64::new(0),
    up: AtomicU64::new(0),
};
static INJECTED: Edges = Edges {
    down: AtomicU64::new(0),
    repeat: AtomicU64::new(0),
    up: AtomicU64::new(0),
};

pub fn record_key_edge(injected: bool, down: bool, was_down: bool) {
    let edges = if injected { &INJECTED } else { &NON_INJECTED };
    let counter = match (down, was_down) {
        (true, false) => &edges.down,
        (true, true) => &edges.repeat,
        (false, true) => &edges.up,
        (false, false) => return,
    };
    counter.fetch_add(1, Ordering::Relaxed);
}

pub fn isolated_context(mut context: Context<Wry>) -> Context<Wry> {
    context.config_mut().identifier = QA_ID.into();
    context
}

fn report_directory() -> io::Result<PathBuf> {
    let executable = std::env::current_exe()?;
    let directory = executable
        .parent()
        .ok_or_else(|| io::Error::other("missing QA executable path"))?
        .join("native-qa");
    if !directory.join("session.txt").is_file() {
        return Err(io::Error::other(
            "missing native-qa/session.txt in the test directory",
        ));
    }
    Ok(directory)
}

pub fn start(app: AppHandle) -> io::Result<()> {
    let directory = report_directory()?;
    if app.config().identifier != QA_ID {
        return Err(io::Error::other(
            "QA profile isolation could not be established",
        ));
    }
    thread::Builder::new()
        .name("zju-native-qa".into())
        .spawn(move || audit(app, directory))?;
    Ok(())
}

fn phase(path: &Path) -> Option<String> {
    let value = fs::read_to_string(path).ok()?;
    let (run, name) = value.trim().split_once(':')?;
    if !(1..=24).contains(&run.len())
        || !run
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        || !PHASES.contains(&name)
    {
        return None;
    }
    Some(format!("{run}-{name}"))
}

#[derive(Serialize)]
struct Range {
    first: f64,
    min: f64,
    max: f64,
    last: f64,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct RenderSummary {
    samples: u32,
    core_consistency: bool,
    moc_version: u64,
    drawables: u64,
    parameters: BTreeMap<String, Range>,
}

impl RenderSummary {
    fn add(&mut self, sample: &Value) {
        let Some(renderer) = sample.get("renderer").filter(|value| value.is_object()) else {
            return;
        };
        self.samples += 1;
        self.core_consistency = renderer["coreConsistency"].as_bool().unwrap_or(false);
        self.moc_version = renderer["mocVersion"].as_u64().unwrap_or(0);
        self.drawables = renderer["drawables"].as_u64().unwrap_or(0);
        for name in PARAMETER_NAMES {
            if let Some(value) = renderer["parameters"][name]
                .as_f64()
                .filter(|v| v.is_finite())
            {
                self.add_value(name, value);
            }
        }
        if let Some(value) = sample["badges"].as_f64() {
            self.add_value("keyBadgeCount", value);
        }
    }

    fn add_value(&mut self, name: &str, value: f64) {
        let range = self.parameters.entry(name.into()).or_insert(Range {
            first: value,
            min: value,
            max: value,
            last: value,
        });
        range.min = range.min.min(value);
        range.max = range.max.max(value);
        range.last = value;
    }
}

fn sample_renderer(app: &AppHandle) -> Option<Value> {
    let pet = app.get_webview_window("pet")?;
    let (sender, receiver) = mpsc::sync_channel(1);
    pet.eval_with_callback(
        r#"(() => {
           const data = window.__petStatus?.read();
           if (!data) return null;
           const {coreConsistency, mocVersion, drawables, parameters} = data.renderer;
           return {renderer: {coreConsistency, mocVersion, drawables, parameters},
                   badges: document.querySelectorAll('#key > kbd').length};
        })()"#,
        move |value| {
            let _ = sender.try_send(value);
        },
    )
    .ok()?;
    let result = receiver.recv_timeout(Duration::from_millis(250)).ok()?;
    serde_json::from_str(&result).ok()
}

fn key_delta(edges: &Edges, first: [u64; 3]) -> Value {
    let current = edges.snapshot();
    json!({
        "down":current[0].saturating_sub(first[0]),
        "repeat":current[1].saturating_sub(first[1]),
        "up":current[2].saturating_sub(first[2]),
    })
}

fn audit(app: AppHandle, directory: PathBuf) {
    let startup = Instant::now();
    let selector = directory.join("session.txt");
    let mut previous = String::new();
    let mut started = startup;
    let mut edges = (NON_INJECTED.snapshot(), INJECTED.snapshot());
    let mut native = (0, 0, 0);
    let mut render = RenderSummary::default();
    let mut write_at = startup;
    while startup.elapsed() < LIFETIME {
        let Some(current) = phase(&selector) else {
            break;
        };
        let state = app.state::<AppState>();
        if current != previous {
            started = Instant::now();
            write_at = started;
            edges = (NON_INJECTED.snapshot(), INJECTED.snapshot());
            native = (
                state.keyboard_presses.load(Ordering::Relaxed),
                state.mouse_presses.load(Ordering::Relaxed),
                state.renderer_frames.load(Ordering::Relaxed),
            );
            render = RenderSummary::default();
            previous = current;
        }
        if let Some(sample) = sample_renderer(&app) {
            render.add(&sample);
        }
        if Instant::now() >= write_at {
            write_at = Instant::now() + Duration::from_millis(250);
            let report = json!({
                "pid": std::process::id(),
                "version": env!("CARGO_PKG_VERSION"),
                "scope": "isolated Windows QA build; aggregate state and Core values only",
                "phase": previous,
                "phaseMilliseconds": started.elapsed().as_millis(),
                "keyboardHook": {
                    "nonInjected": key_delta(&NON_INJECTED, edges.0),
                    "injected": key_delta(&INJECTED, edges.1),
                },
                "keyboardTriggers": state.keyboard_presses.load(Ordering::Relaxed).saturating_sub(native.0),
                "mouseTriggers": state.mouse_presses.load(Ordering::Relaxed).saturating_sub(native.1),
                "renderedFrames": state.renderer_frames.load(Ordering::Relaxed).saturating_sub(native.2),
                "render": render,
                "inputState": input_metrics(app.state()),
                "windows": window_diagnostics(app.clone()).ok(),
            });
            let file = directory.join(format!("{}-{previous}.json", std::process::id()));
            let temporary = file.with_extension("tmp");
            if let Ok(bytes) = serde_json::to_vec_pretty(&report) {
                if fs::write(&temporary, bytes).is_ok() {
                    let _ = fs::rename(&temporary, file);
                }
            }
        }
        thread::sleep(SAMPLE);
    }
}
