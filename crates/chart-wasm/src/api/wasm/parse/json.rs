use wasm_bindgen::JsValue;

pub(crate) fn parse_json<T: serde::de::DeserializeOwned>(
    json: &str,
    context: &str,
) -> Result<T, JsValue> {
    serde_json::from_str(json).map_err(|e| JsValue::from_str(&format!("Invalid {context}: {e}")))
}
