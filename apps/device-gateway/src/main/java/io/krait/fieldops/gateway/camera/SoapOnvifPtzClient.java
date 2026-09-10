package io.krait.fieldops.gateway.camera;

import java.io.StringReader;
import java.time.Duration;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

@Component
@Profile("b04-camera")
public class SoapOnvifPtzClient implements OnvifPtzClient {
    private static final MediaType SOAP = MediaType.parseMediaType("application/soap+xml;charset=UTF-8");
    private final RestClient client;
    private final String deviceServiceUrl;
    private final String mediaServiceUrl;
    private final String ptzServiceUrl;
    private final String profileToken;
    private volatile String discoveredStreamUri;

    public SoapOnvifPtzClient(@Value("${fieldops.b04.camera.device-service-url}") String deviceServiceUrl,
            @Value("${fieldops.b04.camera.media-service-url}") String mediaServiceUrl,
            @Value("${fieldops.b04.camera.ptz-service-url}") String ptzServiceUrl,
            @Value("${fieldops.b04.camera.profile-token}") String profileToken) {
        this.client = RestClient.create();
        this.deviceServiceUrl = deviceServiceUrl;
        this.mediaServiceUrl = mediaServiceUrl;
        this.ptzServiceUrl = ptzServiceUrl;
        this.profileToken = profileToken;
    }

    @Override
    public CameraPose status() {
        ensureDiscovered();
        Document response = invoke(ptzServiceUrl,
                "<tptz:GetStatus><tptz:ProfileToken>%s</tptz:ProfileToken></tptz:GetStatus>"
                        .formatted(profileToken));
        Element panTilt = first(response, "PanTilt");
        Element zoom = first(response, "Zoom");
        String moveStatus = text(response, "MoveStatus");
        return new CameraPose(value(panTilt, "x"), value(panTilt, "y"), value(zoom, "x"),
                moveStatus != null && moveStatus.contains("MOVING"));
    }

    @Override
    public CameraPose continuousMove(double pan, double tilt, double zoom, int timeoutMs) {
        int boundedTimeout = Math.min(500, Math.max(1, timeoutMs));
        invoke(ptzServiceUrl, """
                <tptz:ContinuousMove><tptz:ProfileToken>%s</tptz:ProfileToken>
                  <tptz:Velocity><tt:PanTilt x="%s" y="%s"/><tt:Zoom x="%s"/></tptz:Velocity>
                  <tptz:Timeout>%s</tptz:Timeout>
                </tptz:ContinuousMove>
                """.formatted(profileToken, pan, tilt, zoom, Duration.ofMillis(boundedTimeout)));
        return status();
    }

    @Override
    public CameraPose stop() {
        invoke(ptzServiceUrl, """
                <tptz:Stop><tptz:ProfileToken>%s</tptz:ProfileToken>
                  <tptz:PanTilt>true</tptz:PanTilt><tptz:Zoom>true</tptz:Zoom>
                </tptz:Stop>
                """.formatted(profileToken));
        return status();
    }

    @Override
    public String streamUri() {
        ensureDiscovered();
        return discoveredStreamUri;
    }

    private synchronized void ensureDiscovered() {
        if (discoveredStreamUri != null) return;
        Document capabilities = invoke(deviceServiceUrl, "<tds:GetCapabilities/>");
        if (first(capabilities, "Media") == null || first(capabilities, "PTZ") == null) {
            throw new IllegalStateException("ONVIF capabilities do not include Media and PTZ");
        }
        Document profiles = invoke(mediaServiceUrl, "<trt:GetProfiles/>");
        Element profile = first(profiles, "Profiles");
        if (profile == null || !profileToken.equals(profile.getAttribute("token"))) {
            throw new IllegalStateException("Required ONVIF profile was not discovered");
        }
        Document stream = invoke(mediaServiceUrl, """
                <trt:GetStreamUri><trt:StreamSetup><tt:Stream>RTP-Unicast</tt:Stream>
                  <tt:Transport><tt:Protocol>RTSP</tt:Protocol></tt:Transport></trt:StreamSetup>
                  <trt:ProfileToken>%s</trt:ProfileToken></trt:GetStreamUri>
                """.formatted(profileToken));
        discoveredStreamUri = text(stream, "Uri");
        if (discoveredStreamUri == null || !discoveredStreamUri.startsWith("rtsp://127.0.0.1:")) {
            throw new IllegalStateException("ONVIF returned a non-local RTSP URI");
        }
    }

    private Document invoke(String uri, String body) {
        String response = client.post().uri(uri).contentType(SOAP).accept(SOAP)
                .body(envelope(body)).retrieve().body(String.class);
        if (response == null || response.length() > 262_144) throw new IllegalStateException("Invalid SOAP response");
        try {
            return parseSecurely(response);
        } catch (Exception error) {
            throw new IllegalStateException("Unsafe or malformed SOAP response", error);
        }
    }

    private static Document parseSecurely(String xml) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        return factory.newDocumentBuilder().parse(new InputSource(new StringReader(xml)));
    }

    private static Element first(Document document, String localName) {
        NodeList nodes = document.getElementsByTagNameNS("*", localName);
        return nodes.getLength() == 0 ? null : (Element) nodes.item(0);
    }

    private static double value(Element element, String attribute) {
        if (element == null) throw new IllegalStateException("ONVIF pose element is missing");
        return Double.parseDouble(element.getAttribute(attribute));
    }

    private static String text(Document document, String localName) {
        Element element = first(document, localName);
        return element == null ? null : element.getTextContent().strip();
    }

    private static String envelope(String body) {
        return """
                <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
                  xmlns:tds="http://www.onvif.org/ver10/device/wsdl"
                  xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
                  xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"
                  xmlns:tt="http://www.onvif.org/ver10/schema"><s:Body>%s</s:Body></s:Envelope>
                """.formatted(body);
    }
}
