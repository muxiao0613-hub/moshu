fn main() {
    if moshub_lib::run().is_err() {
        eprintln!("MOSHUB_DESKTOP_START_FAILED");
        std::process::exit(1);
    }
}
