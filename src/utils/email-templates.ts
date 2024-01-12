export const sharePropertyTemplate = `<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <title>Share Property</title>
    <style type="text/css">
      a {
        text-decoration: none;
      }

      p,
      a,
      h1,
      h2,
      h3,
      h4,
      h5,
      h6,
      b,
      strong,
      span,
      small {
        margin: 0;
        font-family: 'Inter', 'Trebuchet MS', 'Lucida Sans Unicode', 'Lucida Grande', 'Lucida Sans', Arial, sans-serif;
      }

      h1,
      h2,
      h3,
      h4,
      h5,
      h6 {
        color: #ffffff;
        font-size: inherit;
        font-weight: 700;
      }

      img {
        display: block;
      }

      html,
      body {
        width: 100%;
        margin: 0;
        height: 100%;
      }

      *,
      ::after,
      ::before {
        box-sizing: border-box;
        border-width: 0;
        border-style: solid;
        border-color: inherit;
      }

      .e-container {
        padding: 24px;
        background-color: #ffffff;
      }

      .e-card {
        width: 100%;
        margin: 0 auto;
        border: 1px solid #d9d9d9;
        padding: 48px;
        max-width: 33rem;
        border-radius: 12px;
      }

      .e-card-text {
        color: #000;
        margin: 24px 0;
        font-size: 16px;
        line-height: 24px;
      }

      .e-card-button {
        color: #ffffff !important;
        width: fit-content;
        margin: 16px auto 0 auto;
        display: block;
        padding: 8px 24px;
        text-align: center;
        font-weight: 700;
        line-height: 24px;
        border-radius: 999px;
        background-color: #4b628e;
      }

      .e-card-property {
        border: 1px solid #d9d9d9;
        border-radius: 8px;
      }

      .e-card-property-image {
        width: 100%;
        height: 240px;
        border-top-left-radius: 8px;
        border-top-right-radius: 8px;
      }

      .e-card-property-body {
        padding: 20px;
      }

      .e-card-property-title {
        color: #4b628e;
        font-size: 24px;
        font-weight: 500;
        line-height: 32px;
      }

      .e-card-property-info {
        color: #8c8c8c;
        display: inline-flex;
        margin-right: 24px;
      }

      .e-card-property-infos {
        margin: 16px 0;
        display: inline-flex;
      }

      .e-card-property-info-icon {
        margin-right: 8px;
      }

      .e-card-property-address {
        color: #4b628e;
        display: block;
        font-size: 16px;
        font-weight: 500;
        line-height: 24px;
      }
    </style>
  </head>

  <body class="e-container">
    <div class="e-card">
      <p class="e-card-text">
        Hi <%= data.name %>
        <br /><br />
        You’ve received a new message from <%= data.orgName %>.
        <br /><br />
        Click here to access
      </p>

      <a href="<%= data.link %>" class="e-card-button">Access Now</a>

      <p class="e-card-text">
        You can access your Portal with your favorite web browser, or use the AVA app which you can find in the app
        store.
        <br /><br />
        I look forward to working with you!
				<br /><br />
        Best,
        <br /><br />
        <%= data.orgName %>
      </p>
    </div>
  </body>
</html>`;
