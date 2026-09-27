// The worker validates the return URL again before creating a fresh OAuth state.
const returnUrl = new URL(location.href).searchParams.get('return');
if (returnUrl) document.getElementById('signInReturn').value = returnUrl;
