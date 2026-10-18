Attribute VB_Name = "RecordExoticAnimations"
Option Explicit

' ============================================================================
' RecordExoticAnimations - record REAL PowerPoint-authored <p:timing> OOXML
' for the exotic animation preset IDs that the catalog generator currently
' approximates. PowerPoint itself writes the animation via AddEffect/PresetType,
' so the resulting slide XML is canonical. A companion python helper then
' extracts each slide's <p:timing> and converts it back into catalog recipes.
'
' HOW TO USE
'   1. Open ANY PowerPoint presentation (a blank one is fine).
'   2. Alt+F11 -> Insert -> Module -> paste this file's contents.
'   3. Run: RecordAllPresets
'   4. File -> Save As -> keep open. The macro appends N slides, one per preset.
'   5. Save the file (e.g. recorded-presets.pptx), then close.
'   6. In this repo run:
'        python3 scripts/extract_recorded_animations.py <recorded.pptx> \
'            --out test-files/recorded
'   The helper writes one JSON per slide with the exact <p:timing> XML and a
'   best-effort recipe mapping you can fold back into effect_catalog.py.
' ============================================================================

' Presets that the stress/catalog builders approximate. Each row:
'   label | msoAnimEffect_<PresetType> | isExit(True=exit)
' The enum value for exit variants is _Exit; Entrance is the plain value.
Private Type PresetDef
    Label As String
    Entry As MsoAnimEffect
    Exit_ As MsoAnimEffect
End Type

Private Function GetPresets() As Variant
    ' Format: Array(label, entrancePreset, exitPreset, preserveAspect, ...)
    ' Using MsoAnimEffect constants (Office 2010+; some presetEnums differ by version).
    GetPresets = Array( _
        Array("Boomerang", msoAnimEffectBoomerang, msoAnimEffectBoomerangExit) _
      , Array("Bounce", msoAnimEffectBounce, msoAnimEffectBounceExit) _
      , Array("CenterRevolve", msoAnimEffectCenterRevolve, msoAnimEffectCenterRevolveExit) _
      , Array("ColorPulse", msoAnimEffectColorPulse, msoAnimEffectColorPulseExit) _
      , Array("Compress", msoAnimEffectCompress, msoAnimEffectCompressExit) _
      , Array("CurveDown", msoAnimEffectCurveDown, msoAnimEffectCurveDownExit) _
      , Array("CurveUp", msoAnimEffectCurveUp, msoAnimEffectCurveUpExit) _
      , Array("Credits", msoAnimEffectCredits, msoAnimEffectCreditsExit) _
      , Array("Drop", msoAnimEffectDrop, msoAnimEffectDropExit) _
      , Array("FloatDown", msoAnimEffectFloatDown, msoAnimEffectFloatDownExit) _
      , Array("FloatUp", msoAnimEffectFloatUp, msoAnimEffectFloatUpExit) _
      , Array("Flip", msoAnimEffectFlip, msoAnimEffectFlipExit) _
      , Array("GrowAndTurn", msoAnimEffectGrowAndTurn, msoAnimEffectGrowAndTurnExit) _
      , Array("Pinwheel", msoAnimEffectPinwheel, msoAnimEffectPinwheelExit) _
      , Array("RiseUp", msoAnimEffectRiseUp, msoAnimEffectRiseUpExit) _
      , Array("Shimmer", msoAnimEffectShimmer, msoAnimEffectShimmerExit) _
      , Array("Spinner", msoAnimEffectSpinner, msoAnimEffectSpinnerExit) _
      , Array("SpiralIn", msoAnimEffectSpiralIn, msoAnimEffectSpiralInExit) _
      , Array("SpiralOut", msoAnimEffectSpiralOut, msoAnimEffectSpiralOutExit) _
      , Array("Stretchy", msoAnimEffectStretchy, msoAnimEffectStretchyExit) _
      , Array("StretchUp", msoAnimEffectStretchUp, msoAnimEffectStretchUpExit) _
      , Array("Swivel", msoAnimEffectSwivel, msoAnimEffectSwivelExit) _
      , Array("Teeter", msoAnimEffectTeeter, msoAnimEffectTeeterExit) _
      , Array("Underline", msoAnimEffectUnderline, msoAnimEffectUnderlineExit) _
      , Array("Wave", msoAnimEffectWave, msoAnimEffectWaveExit) _
      , Array("Whip", msoAnimEffectWhip, msoAnimEffectWhipExit) _
      , Array("BoldFlash", msoAnimEffectBoldFlash, msoAnimEffectBoldFlashExit) _
      , Array("Blink", msoAnimEffectBlink, msoAnimEffectBlinkExit) _
      , Array("BoldReveal", msoAnimEffectBoldReveal, msoAnimEffectBoldRevealExit) _
      , Array("GrowWithColor", msoAnimEffectGrowWithColor, msoAnimEffectGrowWithColorExit) _
    )
End Function

Public Sub RecordAllPresets()
    Dim presets As Variant
    presets = GetPresets()

    Dim i As Long
    For i = LBound(presets) To UBound(presets)
        Dim label As String
        label = CStr(presets(i)(0))
        Dim entry As MsoAnimEffect
        Dim x As MsoAnimEffect
        entry = presets(i)(1)
        x = presets(i)(2)
        MakePresetSlide label, entry
        MakePresetSlide label & "_Exit", x
    Next i

    MsgBox "Created " & (UBound(presets) - LBound(presets) + 1) * 2 & _
        " preset slides. File -> Save As to keep (e.g. recorded-presets.pptx)."
End Sub

' Build one slide with a single labelled shape carrying the given animation preset.
Private Sub MakePresetSlide(ByVal label As String, ByVal preset As MsoAnimEffect)
    If preset = msoAnimEffectNone Then Exit Sub

    Dim sld As Slide
    Set sld = ActivePresentation.Slides.Add( _
        ActivePresentation.Slides.Count + 1, ppLayoutTitleOnly)

    ' Title text = preset label (used by the extractor to name the JSON).
    If sld.Shapes.HasTitle Then
        sld.Shapes.Title.TextFrame.TextRange.Text = label
    End If

    ' One labelled autoshape, centered.
    Dim shp As Shape
    Set shp = sld.Shapes.AddShape( _
        msoShapeRoundedRectangle, 200, 200, 360, 120)
    shp.TextFrame.TextRange.Text = label
    shp.TextFrame.TextRange.Font.Name = "Arial"
    shp.TextFrame.TextRange.Font.Size = 18

    ' Apply the preset via PowerPoint's own animation authoring engine.
    Dim seq As Sequence
    Set seq = sld.TimeLine.MainSequence
    Dim eff As Effect
    Set eff = seq.AddEffect( _
        Shape:=shp, effectId:=preset, trigger:=msoAnimTriggerOnPageClick)
    eff.Timing.Duration = 0.8
    eff.Timing.TriggerType = msoAnimTriggerOnPageClick
End Sub
