// services/httpService.js

const BASE_URL = "http://localhost:8000/api"; 
//cambiar a la URL de backend cuando esté definido

async function request(endpoint, options = {}) {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    });

    const contentType = response.headers.get("content-type") || "";

    if (!response.ok) {
      let errorMessage = `Error ${response.status}: ${response.statusText}`;
      let errorPayload;

      try {
        if (contentType.includes("application/json")) {
          errorPayload = await response.json();
          errorMessage = errorPayload?.message || errorPayload?.detail || errorMessage;
        } else {
          errorPayload = await response.text();
          if (typeof errorPayload === "string" && errorPayload.trim().length > 0) {
            errorMessage = errorPayload;
          }
        }
      } catch (parseError) {
        console.warn("No se pudo parsear el cuerpo del error", parseError);
      }

      const error = new Error(errorMessage);
      error.status = response.status;
      error.payload = errorPayload;
      throw error;
    }

    if (response.status === 204) {
      return null;
    }

    if (contentType.includes("application/json")) {
      return await response.json();
    }

    return await response.text();
  } catch (error) {
    console.error("HTTP Error:", error);
    throw error;
  }
}

// GET
export function get(endpoint) {
  return request(endpoint, { method: "GET" });
}

// POST
export function post(endpoint, data) {
  return request(endpoint, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// PUT
export function put(endpoint, data) {
  return request(endpoint, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// DELETE
export async function del(url) {
  const response = await fetch(`${BASE_URL}${url}`, { method: "DELETE" });
  if (!response.ok) {
    let errorMsg = "Error";
    try {
      errorMsg = await response.text();
    } catch {}
    throw new Error(errorMsg);
  }
  // No devolver nada si es 204
  return;
}
