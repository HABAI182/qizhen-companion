#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod app;
mod edition;
mod desktop;
mod preferences;
mod platform;
mod window_layout;
mod hit_test;
#[cfg(windows)] mod keyboard_edges;
#[cfg(all(windows, feature = "native-qa"))]
mod native_qa;
fn main(){app::run();}
mod sound;
mod key_target;
