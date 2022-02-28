import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { getDaysFromNowToDate } from '../helpers/time.helper';
import { CropService } from '../services/crop.service';
import { FarmerReportService } from '../services/farmer-report.service';
import { FarmlandService } from '../services/farmland.service';
import { PhotoService } from '../services/photo.service';
import { Crop, SeedStage } from '../types/crop.type';
import { FarmerReport } from '../types/farmer-report.type';
import { Farmland } from '../types/farmland.type';
import { SubmitReportModalPage } from './modal/submit-report-modal.page';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage implements OnInit, OnDestroy {
  public farmlandSelectionForm: FormGroup;
  public farmlands: Farmland[];
  public currentFarmland: Farmland;
  public currentSeedStage: SeedStage;
  public nextSeedStage: SeedStage;
  public currentSeedStageImagePath: string;
  public submittedFarmerReports: FarmerReport[] = [];
  public plantedFarmerReport: FarmerReport;

  public estimatedYieldDateEarliest: string;
  public estimatedYieldDateLatest: string;
  public estimatedYieldDayEarliest: number;
  public estimatedYieldDayLatest: number;
  public estimatedProfit: number;
  public estimatedYieldAmount: number;

  private farmlandSelectionSubscription: Subscription;
  private farmlandHookSubscription: Subscription;
  private farmerReportHookSubscription: Subscription;
  private seedStageHookSubscriptions: Subscription;

  constructor(
    private photoService: PhotoService,
    private cropService: CropService,
    private farmlandService: FarmlandService,
    private farmerReportService: FarmerReportService,
    private formBuilder: FormBuilder,
    private modalController: ModalController
  ) {}

  public ngOnInit(): void {
    this.setupForm();
    this.setupFarmlandHooks();
  }

  public ngOnDestroy(): void {
    this.farmlandSelectionSubscription.unsubscribe();
    this.farmlandHookSubscription.unsubscribe();
    this.farmerReportHookSubscription.unsubscribe();
    this.seedStageHookSubscriptions.unsubscribe();
  }

  public async onBeginSubmitFarmerReport() {
    const modal = await this.modalController.create({
      component: SubmitReportModalPage,
      cssClass: 'my-custom-class',
      componentProps: {
        currentFarmland: this.currentFarmland,
        currentCrop: this.getExistingCrop(),
        currentSeedStage: this.currentSeedStage,
      },
    });

    modal.onDidDismiss().then(({ data }) => {
      this.photoService.clearPhoto();

      if (data?.success) {
        console.log('called');
        this.setupFarmlandHooks();
      }
    });

    return await modal.present();
  }

  public hasSubmittedReports(): boolean {
    return this.submittedFarmerReports.length > 0;
  }

  public hasPlantedFarmerReport(): boolean {
    return this.plantedFarmerReport !== null;
  }

  public getFarmland(id: number): Farmland {
    return this.farmlands.find((farmland) => farmland.id === id);
  }

  public getPlantedFarmerReport(
    farmerReports: FarmerReport[]
  ): FarmerReport | null {
    for (const farmerReport of farmerReports) {
      if (farmerReport.seedStage.slug === 'seeds-planted') {
        return farmerReport;
      }
    }
    return null;
  }

  public getExistingCrop(): Crop {
    if (this.hasSubmittedReports()) {
      return this.submittedFarmerReports[0].crop;
    }

    return null;
  }

  public translateSeedStage(seedStage: SeedStage): string {
    return this.cropService.translateSeedStagePastTense(seedStage);
  }

  private setupForm() {
    this.farmlandSelectionForm = this.formBuilder.group({
      farmland: ['', Validators.required],
    });

    this.farmlandSelectionSubscription = this.farmlandSelectionForm
      .get('farmland')
      .valueChanges.subscribe((selectedFarmlandId) => {
        const selectedFarmland = this.getFarmland(selectedFarmlandId);
        this.currentFarmland = selectedFarmland;
        this.setupFarmerReportHooks(selectedFarmland);
        this.retrieveSeedStage(selectedFarmland);
      });
  }

  private setupFarmlandHooks() {
    if (this.farmlandHookSubscription) {
      this.farmlandHookSubscription.unsubscribe();
    }

    this.farmlandHookSubscription = this.farmlandService
      .getFarmlands()
      .subscribe((farmlands) => {
        this.farmlands = farmlands;
        const firstFarmland = farmlands[0];

        if (!this.currentFarmland) {
          this.currentFarmland = firstFarmland;
        }

        this.farmlandSelectionForm.patchValue({
          farmland: this.currentFarmland.id,
        });

        this.setupFarmerReportHooks(this.currentFarmland);
        this.retrieveSeedStage(this.currentFarmland);

        console.log('called farmland hooks');
      });
  }

  private setupFarmerReportHooks(currentFarmland: Farmland) {
    if (this.farmerReportHookSubscription) {
      this.farmerReportHookSubscription.unsubscribe();
    }

    this.farmerReportHookSubscription = this.farmerReportService
      .getFarmerReports(currentFarmland)
      .subscribe((data) => {
        this.submittedFarmerReports = data;
        this.plantedFarmerReport = this.getPlantedFarmerReport(data);

        this.computeEstimates();
      });
  }

  private retrieveSeedStage(farmland: Farmland) {
    if (this.seedStageHookSubscriptions) {
      this.seedStageHookSubscriptions.unsubscribe();
    }

    this.seedStageHookSubscriptions = new Subscription();

    this.seedStageHookSubscriptions.add(
      this.cropService.getCurrentSeedStage(farmland).subscribe((data) => {
        this.currentSeedStage = data;
        this.currentSeedStageImagePath =
          this.cropService.getSeedStageImagePath(data);
      })
    );

    this.seedStageHookSubscriptions.add(
      this.cropService.getNextSeedStage(farmland).subscribe((data) => {
        this.nextSeedStage = data;
      })
    );
  }

  private computeEstimates(): void {
    if (!this.hasPlantedFarmerReport()) {
      return;
    }
    const {
      estimatedProfit,
      estimatedYieldAmount,
      estimatedYieldDateEarliest,
      estimatedYieldDateLatest,
    } = this.plantedFarmerReport;

    this.estimatedProfit = estimatedProfit;
    this.estimatedYieldAmount = estimatedYieldAmount;
    this.estimatedYieldDateEarliest = estimatedYieldDateEarliest;
    this.estimatedYieldDateLatest = estimatedYieldDateLatest;

    this.estimatedYieldDayEarliest = getDaysFromNowToDate(
      new Date(estimatedYieldDateEarliest)
    );

    this.estimatedYieldDayLatest = getDaysFromNowToDate(
      new Date(estimatedYieldDateLatest)
    );
  }
}
