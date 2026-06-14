import "./styles.css";

const header = document.querySelector(".site-header");
window.addEventListener("scroll", () => {
  header?.classList.toggle("is-scrolled", window.scrollY > 12);
});

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        if (entry.target.id === "demo") {
          runDemo();
        }
      }
    });
  },
  { threshold: 0.15 }
);

document.querySelectorAll(".hero, section").forEach((el) => {
  observer.observe(el);
});

// Chat Demo Animation Logic
const userText = document.getElementById("demo-user-text");
const aiContainer = document.getElementById("demo-ai-container");
const aiText = document.getElementById("demo-ai-text");
const aiCodeContainer = document.getElementById("demo-ai-code-container");
const aiCode = document.getElementById("demo-ai-code");

let demoHasRun = false;

const typeText = async (element, text, speed = 35) => {
  for (let i = 0; i < text.length; i++) {
    // Convert newlines to breaks or handle text
    if (text.charAt(i) === '\n') {
        element.innerHTML += '<br>';
    } else {
        element.innerHTML += text.charAt(i);
    }
    await new Promise(r => setTimeout(r, speed + Math.random() * 20));
  }
};

const runDemo = async () => {
  if (demoHasRun || !userText) return;
  demoHasRun = true;
  
  // Clean up
  userText.innerHTML = "";
  aiText.innerHTML = "";
  aiCode.innerHTML = "";
  
  // Initial wait
  await new Promise(r => setTimeout(r, 600));
  userText.innerHTML = '<span class="cursor-blink"></span>';
  await new Promise(r => setTimeout(r, 600));
  userText.innerHTML = "";
  
  await typeText(userText, "Write a short python function to read a CSV file using pandas.");
  
  await new Promise(r => setTimeout(r, 400));
  
  // AI appears
  aiContainer.style.display = "flex";
  // Trigger reflow
  void aiContainer.offsetWidth;
  aiContainer.style.opacity = "1";
  
  aiText.innerHTML = '<span class="cursor-blink"></span>';
  await new Promise(r => setTimeout(r, 600));
  aiText.innerHTML = "";
  
  await typeText(aiText, "Certainly! Here is a simple function using pandas:");
  
  aiCodeContainer.style.display = "block";
  const codeContent = `import pandas as pd

def load_data(filepath):
    df = pd.read_csv(filepath)
    return df`;
  
  await typeText(aiCode, codeContent, 15);
  aiCode.innerHTML += '<span class="cursor-blink"></span>';
};
