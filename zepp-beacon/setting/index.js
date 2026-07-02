// Settings screen, rendered inside the Zepp phone app. One-time pairing: paste the
// RogueMeso base URL and the beacon token. Values land in settingsStorage, which the
// Side Service reads on every request — no OAuth, revoke by changing the token.

const FIELD_STYLE = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  margin: "12px 16px",
};

const LABEL_STYLE = {
  fontSize: "12px",
  fontWeight: "bold",
  color: "#8a93a0",
};

const INPUT_STYLE = {
  fontSize: "14px",
  padding: "10px",
  borderRadius: "8px",
  background: "#f2f4f6",
  color: "#17202b",
};

AppSettingsPage({
  state: { props: {} },

  setState(props) {
    this.state.props = props;
  },

  field(label, key, placeholder) {
    const current = this.state.props.settingsStorage.getItem(key) || "";
    return View({ style: FIELD_STYLE }, [
      Text({ style: LABEL_STYLE }, label),
      TextInput({
        label: current || placeholder,
        settingsKey: key,
        subStyle: INPUT_STYLE,
      }),
    ]);
  },

  build(props) {
    this.setState(props);
    return View({ style: { padding: "8px 0" } }, [
      this.field("Server URL", "serverUrl", "https://your-roguemeso-host"),
      this.field("Beacon token", "token", "paste the token from RogueMeso"),
      View(
        { style: { margin: "16px", fontSize: "12px", color: "#8a93a0", lineHeight: "18px" } },
        Text(
          {},
          "Spike build: the watch app's Send-ping button POSTs a test payload to " +
            "<server>/api/wearables/zepp using this URL + token.",
        ),
      ),
    ]);
  },
});
