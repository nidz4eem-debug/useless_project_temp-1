document.addEventListener("DOMContentLoaded", () => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");
  const fileNameLabel = document.getElementById("file-name");
  const uploadBtn = document.getElementById("upload-btn");
  const form = document.getElementById("upload-form");

  function updateSelectedFile(file) {
    if (file) {
      fileNameLabel.textContent = `Selected: ${file.name}`;
      uploadBtn.disabled = false;
    } else {
      fileNameLabel.textContent = "";
      uploadBtn.disabled = true;
    }
  }

  fileInput.addEventListener("change", () => {
    updateSelectedFile(fileInput.files[0]);
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("dragover");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files && files.length > 0) {
      fileInput.files = files;
      updateSelectedFile(files[0]);
    }
  });

  form.addEventListener("submit", () => {
    uploadBtn.disabled = true;
    uploadBtn.textContent = "Uploading...";
  });
});
