.PHONY: help quality fix fix-rust rust rust-fmt rust-lint rust-test ts ts-typecheck ts-build wasm

help:
	@echo "Available targets:"
	@echo "  make rust         - Run all Rust checks (fmt, clippy, tests)"
	@echo "  make ts           - Run all TypeScript checks (typecheck, build)"
	@echo "  make wasm         - Build wasm package (dev web target)"
	@echo "  make quality      - Run rust + ts checks (same as CI intent)"
	@echo "  make fix          - Auto-fix Rust fmt + clippy suggestions"
	@echo ""
	@echo "Granular targets:"
	@echo "  make fix-rust"
	@echo "  make rust-fmt"
	@echo "  make rust-lint"
	@echo "  make rust-test"
	@echo "  make ts-typecheck"
	@echo "  make ts-build"

quality: rust ts

fix: fix-rust

fix-rust:
	cargo fmt --all
	cargo clippy --fix --all-targets --all-features --allow-dirty --allow-staged

rust: rust-fmt rust-lint rust-test

rust-fmt:
	cargo fmt --all -- --check

rust-lint:
	cargo clippy --all-targets --all-features -- -D warnings

rust-test:
	cargo test --all --all-features

ts: ts-typecheck ts-build

ts-typecheck:
	npm --prefix packages/chart-sdk run typecheck

ts-build:
	npm --prefix packages/chart-sdk run build

wasm:
	wasm-pack build --dev --target web --out-dir packages/chart-sdk/pkg
