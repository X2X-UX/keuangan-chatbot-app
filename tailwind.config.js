module.exports = {
  content: ["./src/client/index.html", "./src/client/app/**/*.js"],
  theme: {
    extend: {
      colors: {
        brand: {
          ink: "#102033",
          primary: "#0c4a87",
          "primary-strong": "#083664",
          accent: "#0e8b76",
          soft: "#edf2f7",
          surface: "#ffffff"
        }
      },
      boxShadow: {
        card: "0 20px 45px rgba(8, 29, 54, 0.1)",
        soft: "0 14px 30px rgba(11, 34, 63, 0.09)"
      },
      borderRadius: {
        "4xl": "2rem"
      },
      fontFamily: {
        display: ['"Aptos Display"', '"Segoe UI"', '"Trebuchet MS"', "sans-serif"],
        body: ['"Aptos"', '"Segoe UI Variable Text"', '"Segoe UI"', "sans-serif"]
      }
    }
  },
  plugins: []
};
